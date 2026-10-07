"use client";

import { useState, useEffect, useMemo } from "react";
import api from "../../utils/axiosInstance";
import { useAuth } from "../context/AuthContext";
import CustomerHistoryDrawer from "../_components/CustomerHistoryDrawer";
import {
  CustomerProfile, Ticket, TicketEvent, PRIORITIES, DESKS, CATEGORY_NAMES, EVENT_LABELS,
  ticketRef, formatWhen, errorText, slaText, PriorityBadge, StatusBadge,
} from "../_components/crm";
import { AiChip, AiSuggestionPanel, Suggestion, aiFlagsUrgent } from "./_components/AiSuggestion";

type ActionModal =
  | { kind: "resolve"; ticket: Ticket }
  | { kind: "reopen"; ticket: Ticket }
  | { kind: "log" }
  | null;

const CRO_ROLES = ["CUSTOMER_RELATIONS_OFFICER", "SUPER_ADMIN", "SYSTEM_ADMIN"];

// Overdue, escalated, marked urgent, or read as urgent by the AI.
const needsAttention = (t: Ticket, suggestions: Record<number, Suggestion>) => t.status !== "RESOLVED"
  && (t.escalated || t.slaBreached || t.priority === "URGENT" || aiFlagsUrgent(t, suggestions[t.ticketId]));

export default function ComplaintsDesk() {
  const { user, isLoading } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [suggestions, setSuggestions] = useState<Record<number, Suggestion>>({});
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [attentionOnly, setAttentionOnly] = useState(false);

  // Panels & modals
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [timeline, setTimeline] = useState<TicketEvent[]>([]);
  const [historyFor, setHistoryFor] = useState<number | null>(null);
  const [modal, setModal] = useState<ActionModal>(null);
  const [modalText, setModalText] = useState("");
  const [busy, setBusy] = useState(false);

  // Log-ticket form (CRO on behalf of a customer)
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [logForm, setLogForm] = useState({ customerId: "", category: "GENERAL", priority: "MEDIUM", issueDescription: "" });

  const role = user?.role || "";
  const isCro = CRO_ROLES.includes(role);
  const canAct = role !== "EXECUTIVE_OWNER"; // the owner has a read-only view
  const canSeeHistory = isCro || role === "EXECUTIVE_OWNER";

  const fetchTickets = async () => {
    try {
      // The backend already limits department heads to their own desk's tickets.
      const res = await api.get<Ticket[]>("/complaints");
      setTickets(res.data);
      setLoadError("");
    } catch {
      setLoadError("Failed to load tickets.");
    }
  };

  // AI suggestions are a helper: if they fail to load, the desk works as before.
  const fetchSuggestions = async () => {
    try {
      const res = await api.get<Suggestion[]>("/complaints/suggestions");
      setSuggestions(Object.fromEntries(res.data.map(s => [s.ticketId, s])));
    } catch {
      setSuggestions({});
    }
  };

  const askAi = async (ticket: Ticket) => {
    try {
      const res = await api.post<Suggestion>(`/complaints/${ticket.ticketId}/suggestion`);
      setSuggestions(prev => ({ ...prev, [ticket.ticketId]: res.data }));
    } catch (err) {
      flash("error", errorText(err, "Couldn't ask the AI."));
    }
  };

  useEffect(() => {
    // Started from a callback so the state updates aren't made inside the effect body.
    if (user) Promise.resolve().then(() => { fetchTickets(); fetchSuggestions(); });
  }, [user]);

  // While the AI is still reading some tickets, check back every few seconds.
  const anyPending = Object.values(suggestions).some(s => s.status === "PENDING");
  useEffect(() => {
    if (!anyPending) return;
    const id = setInterval(fetchSuggestions, 4000);
    return () => clearInterval(id);
  }, [anyPending]);

  const flash = (type: "ok" | "error", text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const replaceTicket = (updated: Ticket) => {
    setTickets(prev => prev.map(t => (t.ticketId === updated.ticketId ? updated : t)));
    if (detail?.ticketId === updated.ticketId) {
      setDetail(updated);
      loadTimeline(updated.ticketId);
    }
  };

  const loadTimeline = async (ticketId: number) => {
    try {
      const res = await api.get<TicketEvent[]>(`/complaints/${ticketId}/events`);
      setTimeline(res.data);
    } catch {
      setTimeline([]);
    }
  };

  const openDetail = (ticket: Ticket) => {
    setDetail(ticket);
    setTimeline([]);
    loadTimeline(ticket.ticketId);
  };

  const handleAssign = async (ticket: Ticket, desk: string) => {
    if (!desk || desk === ticket.assignedStaff) return;
    try {
      const res = await api.put<Ticket>(`/complaints/${ticket.ticketId}/assign`, null, { params: { staffName: desk } });
      replaceTicket(res.data);
      flash("ok", `${ticketRef(ticket.ticketId)} routed to ${desk}.`);
    } catch (err) {
      flash("error", errorText(err, "Couldn't reassign the ticket."));
    }
  };

  const handlePriority = async (ticket: Ticket, value: string) => {
    try {
      const res = await api.put<Ticket>(`/complaints/${ticket.ticketId}/priority`, null, { params: { value } });
      replaceTicket(res.data);
    } catch (err) {
      flash("error", errorText(err, "Couldn't change the priority."));
    }
  };

  const handleDelete = async (ticket: Ticket) => {
    if (!confirm(`Permanently delete ${ticketRef(ticket.ticketId)}? This cannot be undone.`)) return;
    try {
      await api.delete(`/complaints/${ticket.ticketId}`);
      setTickets(prev => prev.filter(t => t.ticketId !== ticket.ticketId));
      if (detail?.ticketId === ticket.ticketId) setDetail(null);
      flash("ok", "Ticket deleted.");
    } catch (err) {
      flash("error", errorText(err, "Couldn't delete the ticket."));
    }
  };

  const openLogModal = async () => {
    setModal({ kind: "log" });
    setLogForm({ customerId: "", category: "GENERAL", priority: "MEDIUM", issueDescription: "" });
    if (customers.length === 0) {
      try {
        const res = await api.get<CustomerProfile[]>("/customers");
        setCustomers(res.data.sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        flash("error", "Couldn't load the customer list.");
      }
    }
  };

  const submitModal = async () => {
    if (!modal) return;
    setBusy(true);
    try {
      if (modal.kind === "resolve") {
        const res = await api.put<Ticket>(`/complaints/${modal.ticket.ticketId}/resolve`, { note: modalText });
        replaceTicket(res.data);
        flash("ok", `${ticketRef(modal.ticket.ticketId)} resolved. The customer has been emailed.`);
      } else if (modal.kind === "reopen") {
        const res = await api.put<Ticket>(`/complaints/${modal.ticket.ticketId}/reopen`, { reason: modalText });
        replaceTicket(res.data);
        flash("ok", `${ticketRef(modal.ticket.ticketId)} reopened.`);
      } else {
        const res = await api.post<Ticket>(`/complaints/submit/${logForm.customerId}`, {
          category: logForm.category,
          priority: logForm.priority,
          issueDescription: logForm.issueDescription.trim(),
        });
        setTickets(prev => [res.data, ...prev]);
        fetchSuggestions(); // shows "AI is reading" and starts checking back
        flash("ok", `${ticketRef(res.data.ticketId)} logged for ${res.data.customer.name}.`);
      }
      setModal(null);
      setModalText("");
    } catch (err) {
      flash("error", errorText(err, "The request failed. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rank = (t: Ticket) => (t.status === "RESOLVED" ? 2 : t.slaBreached || t.escalated || aiFlagsUrgent(t, suggestions[t.ticketId]) ? 0 : 1);
    return tickets
      .filter(t => statusFilter === "ALL" ? true : statusFilter === "ACTIVE" ? t.status !== "RESOLVED" : t.status === statusFilter)
      .filter(t => priorityFilter === "ALL" || t.priority === priorityFilter)
      .filter(t => !attentionOnly || needsAttention(t, suggestions))
      .filter(t => !q || [ticketRef(t.ticketId), t.customer?.name, t.customer?.vehicleRegNo, t.issueDescription, t.assignedStaff]
        .some(v => v?.toLowerCase().includes(q)))
      .sort((a, b) =>
        rank(a) - rank(b)
        || PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority)
        || new Date(b.dateReported).getTime() - new Date(a.dateReported).getTime());
  }, [tickets, suggestions, search, statusFilter, priorityFilter, attentionOnly]);

  const counts = useMemo(() => ({
    active: tickets.filter(t => t.status !== "RESOLVED").length,
    attention: tickets.filter(t => needsAttention(t, suggestions)).length,
    unassigned: tickets.filter(t => t.status !== "RESOLVED" && !t.assignedStaff).length,
  }), [tickets, suggestions]);

  if (isLoading) return null;

  const selectClass = "px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="p-4 md:p-8 min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">CRM Ticketing Desk</h1>
            <p className="text-slate-500 font-medium mt-1">
              {counts.active} active · <span className={counts.attention ? "text-red-700 font-bold" : ""}>{counts.attention} need attention</span>
              {isCro && <> · {counts.unassigned} awaiting triage</>}
            </p>
          </div>
          {isCro && (
            <button onClick={openLogModal} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-black uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all">
              Log Ticket for Customer
            </button>
          )}
        </div>

        {notice && (
          <div role="status" className={`mb-4 px-4 py-3 rounded-xl text-sm font-bold border ${notice.type === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
            {notice.text}
          </div>
        )}

        {/* FILTERS */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ticket, customer, vehicle..."
            aria-label="Search tickets" className="flex-1 min-w-[200px] px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Status filter" className={selectClass}>
            <option value="ACTIVE">Active</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="ALL">All statuses</option>
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} aria-label="Priority filter" className={selectClass}>
            <option value="ALL">All priorities</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input type="checkbox" checked={attentionOnly} onChange={e => setAttentionOnly(e.target.checked)} className="w-4 h-4 accent-red-600" />
            Needs attention
          </label>
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <th className="px-5 py-3">Ticket</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Issue</th>
                  <th className="px-5 py-3">Priority</th>
                  <th className="px-5 py-3">Status / SLA</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-700">
                {visible.map(ticket => {
                  const sla = slaText(ticket);
                  const resolved = ticket.status === "RESOLVED";
                  return (
                    <tr key={ticket.ticketId} className={`border-b border-slate-50 hover:bg-slate-50/60 align-top ${ticket.slaBreached ? "bg-red-50/30" : ""}`}>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <button onClick={() => openDetail(ticket)} className="font-mono text-xs font-bold text-blue-700 hover:underline">
                          {ticketRef(ticket.ticketId)}
                        </button>
                        <div className="text-xs text-slate-500 mt-1">{formatWhen(ticket.dateReported)}</div>
                      </td>

                      <td className="px-5 py-4">
                        {canSeeHistory ? (
                          <button onClick={() => setHistoryFor(ticket.customer.customerID)} className="font-bold text-slate-900 hover:text-blue-700 text-left">
                            {ticket.customer?.name}
                          </button>
                        ) : (
                          <div className="font-bold text-slate-900">{ticket.customer?.name}</div>
                        )}
                        <div className="text-xs text-blue-700 font-bold font-mono mt-1">{ticket.customer?.vehicleRegNo}</div>
                      </td>

                      <td className="px-5 py-4 max-w-[320px]">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{CATEGORY_NAMES[ticket.category] || ticket.category}</div>
                        <div className="text-slate-600 line-clamp-2">{ticket.issueDescription}</div>
                        <AiChip ticket={ticket} suggestion={suggestions[ticket.ticketId]} />
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        {canAct && !resolved ? (
                          <select value={ticket.priority} onChange={e => handlePriority(ticket, e.target.value)}
                            aria-label={`Priority for ${ticketRef(ticket.ticketId)}`} className={selectClass}>
                            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        ) : (
                          <PriorityBadge priority={ticket.priority} />
                        )}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <StatusBadge status={ticket.status} />
                        {sla && (
                          <div className={`text-xs font-bold mt-1.5 ${sla.overdue ? "text-red-700" : "text-slate-500"}`}>
                            {sla.overdue && <span aria-hidden="true">⚠ </span>}{sla.text}
                          </div>
                        )}
                        {ticket.escalated && !resolved && (
                          <div className="text-[10px] font-black uppercase tracking-widest text-red-700 mt-1">Escalated L{ticket.escalationLevel}</div>
                        )}
                        {resolved && <div className="text-xs text-slate-500 mt-1.5">{formatWhen(ticket.resolvedAt)}</div>}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        {isCro && !resolved ? (
                          <select value={ticket.assignedStaff || ""} onChange={e => handleAssign(ticket, e.target.value)}
                            aria-label={`Department for ${ticketRef(ticket.ticketId)}`} className={`${selectClass} max-w-[200px]`}>
                            <option value="" disabled>Triage: choose desk...</option>
                            {DESKS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        ) : (
                          <span className="font-bold text-slate-900 text-sm">{ticket.assignedStaff || "Unassigned"}</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end items-center gap-2">
                          {canAct && !resolved && (
                            <button onClick={() => { setModal({ kind: "resolve", ticket }); setModalText(""); }}
                              className="bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-green-700 shadow-sm whitespace-nowrap">
                              Resolve
                            </button>
                          )}
                          {canAct && resolved && (
                            <button onClick={() => { setModal({ kind: "reopen", ticket }); setModalText(""); }}
                              className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 shadow-sm">
                              Reopen
                            </button>
                          )}
                          {isCro && (
                            <button onClick={() => handleDelete(ticket)} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg" aria-label={`Delete ${ticketRef(ticket.ticketId)}`} title="Delete ticket">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500 font-medium">
                      {loadError || (tickets.length === 0 ? "No tickets in your queue." : "No tickets match these filters.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TICKET DETAIL + TIMELINE */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <aside role="dialog" aria-modal="true" aria-labelledby="ticket-title" className="w-full max-w-lg h-full bg-white shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 id="ticket-title" className="text-lg font-black text-slate-900 font-mono">{ticketRef(detail.ticketId)}</h2>
              <button onClick={() => setDetail(null)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={detail.status} />
                <PriorityBadge priority={detail.priority} />
                {detail.escalated && <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border bg-red-50 text-red-700 border-red-200">Escalated L{detail.escalationLevel}</span>}
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs font-bold text-slate-500">Customer</dt><dd className="font-bold text-slate-900">{detail.customer.name}</dd></div>
                <div><dt className="text-xs font-bold text-slate-500">Vehicle</dt><dd className="font-mono font-bold text-slate-900">{detail.customer.vehicleRegNo}</dd></div>
                <div><dt className="text-xs font-bold text-slate-500">Department</dt><dd className="text-slate-900">{detail.assignedStaff || "Unassigned"}</dd></div>
                <div><dt className="text-xs font-bold text-slate-500">SLA due</dt><dd className="text-slate-900">{detail.status === "RESOLVED" ? "—" : formatWhen(detail.slaDueAt)}</dd></div>
              </dl>
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">Issue</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.issueDescription}</p>
              </div>
              <AiSuggestionPanel ticket={detail} suggestion={suggestions[detail.ticketId]} canAssign={isCro} canAct={canAct}
                onUseDesk={desk => handleAssign(detail, desk)} onUsePriority={value => handlePriority(detail, value)}
                onAskAgain={() => askAi(detail)} />
              {detail.resolutionNote && (
                <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
                  <span className="font-bold">Resolution: </span>{detail.resolutionNote}
                </div>
              )}
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Timeline</p>
                <ol className="relative border-l-2 border-slate-200 ml-2 space-y-4">
                  {timeline.map(e => (
                    <li key={e.eventId} className="ml-4">
                      <span className={`absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full border-2 border-white ${e.action === "ESCALATED" ? "bg-red-600" : e.action === "RESOLVED" ? "bg-green-600" : "bg-blue-600"}`} aria-hidden="true"></span>
                      <p className="text-sm font-bold text-slate-900">
                        {EVENT_LABELS[e.action] || e.action}
                        {e.fromValue && e.toValue && e.action !== "SUBMITTED" && <span className="font-medium text-slate-600"> · {e.fromValue.replace("_", " ")} → {e.toValue.replace("_", " ")}</span>}
                        {!e.fromValue && e.toValue && e.action === "ASSIGNED" && <span className="font-medium text-slate-600"> · {e.toValue}</span>}
                      </p>
                      <p className="text-xs text-slate-500">{formatWhen(e.createdAt)} · {e.performedBy}{e.internalOnly ? " · internal" : ""}</p>
                      {e.note && <p className="text-xs text-slate-600 mt-1">{e.note}</p>}
                    </li>
                  ))}
                  {timeline.length === 0 && <li className="ml-4 text-xs text-slate-500">Loading...</li>}
                </ol>
              </div>
            </div>
          </aside>
        </div>
      )}

      {historyFor !== null && <CustomerHistoryDrawer customerId={historyFor} onClose={() => setHistoryFor(null)} />}

      {/* ACTION MODALS */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="action-title">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-lg w-full border border-slate-200">
            <h3 id="action-title" className="text-xl font-black text-slate-900 mb-1">
              {modal.kind === "resolve" ? `Resolve ${ticketRef(modal.ticket.ticketId)}`
                : modal.kind === "reopen" ? `Reopen ${ticketRef(modal.ticket.ticketId)}`
                : "Log Ticket for Customer"}
            </h3>
            <p className="text-sm text-slate-500 mb-5">
              {modal.kind === "resolve" ? "Explain what was done. This note is emailed to the customer."
                : modal.kind === "reopen" ? "Optionally say why. The customer is notified that work has resumed."
                : "For complaints received by phone or at the counter."}
            </p>

            {modal.kind === "log" ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="log-customer" className="block text-xs font-bold text-slate-700 mb-1">Customer</label>
                  <select id="log-customer" value={logForm.customerId} onChange={e => setLogForm({ ...logForm, customerId: e.target.value })} className={`${selectClass} w-full py-2.5`}>
                    <option value="">Select a customer...</option>
                    {customers.map(c => <option key={c.customerID} value={c.customerID}>{c.name} — {c.vehicleRegNo}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="log-category" className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                    <select id="log-category" value={logForm.category} onChange={e => setLogForm({ ...logForm, category: e.target.value })} className={`${selectClass} w-full py-2.5`}>
                      {Object.entries(CATEGORY_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="log-priority" className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                    <select id="log-priority" value={logForm.priority} onChange={e => setLogForm({ ...logForm, priority: e.target.value })} className={`${selectClass} w-full py-2.5`}>
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="log-description" className="block text-xs font-bold text-slate-700 mb-1">Issue ({logForm.issueDescription.length}/500)</label>
                  <textarea id="log-description" value={logForm.issueDescription} maxLength={500}
                    onChange={e => setLogForm({ ...logForm, issueDescription: e.target.value })}
                    className="w-full h-28 px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none" />
                </div>
              </div>
            ) : (
              <textarea value={modalText} onChange={e => setModalText(e.target.value)} maxLength={1000} aria-label="Note"
                placeholder={modal.kind === "resolve" ? "e.g. Replaced the faulty alternator under warranty and refunded the diagnostic fee." : "Reason (optional)"}
                className="w-full h-32 px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none" />
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModal(null)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button onClick={submitModal}
                disabled={busy
                  || (modal.kind === "resolve" && modalText.trim().length < 5)
                  || (modal.kind === "log" && (!logForm.customerId || logForm.issueDescription.trim().length < 10))}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-50 ${modal.kind === "resolve" ? "bg-green-600 hover:bg-green-700" : "bg-slate-900 hover:bg-slate-800"}`}>
                {busy ? "Saving..." : modal.kind === "resolve" ? "Mark Resolved" : modal.kind === "reopen" ? "Reopen Ticket" : "Log Ticket"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
