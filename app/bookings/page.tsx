"use client";

import { useEffect, useMemo, useState } from "react";
import api from "../../utils/axiosInstance";
import { useAuth } from "../context/AuthContext";
import AssignDialog from "./_components/AssignDialog";
import CompleteJobDialog from "./_components/CompleteJobDialog";
import JobDetailDialog from "./_components/JobDetailDialog";
import NewJobDialog from "./_components/NewJobDialog";
import PackageManager from "./_components/PackageManager";
import {
  ACTIVE_STATUSES, Booking, BookingStatusBadge, Notice, STATUS_LABEL,
  errorText, fmtWhen, inputClass, isoDate, jobRef, rupees,
} from "./_components/booking";

const MANAGERS = ["SERVICE_CENTER_MANAGER", "SUPER_ADMIN", "SYSTEM_ADMIN"];

type Tab = "requests" | "workshop" | "completed" | "all" | "packages" | "mine" | "history" | "board";

// The bill raised for a finished job (from the invoices list), keyed by job id.
interface JobBill { invoiceNumber: string; status: string; balanceDue: number; paidVia: string | null }

// Finished work that still needs something: payment, or handing the vehicle back.
const needsClosing = (b: Booking) => b.status === "COMPLETED" || (b.status === "PAID" && !b.handedOverAt);

export default function WorkshopPage() {
  const { user } = useAuth();
  const role = user?.role || "";
  const isManager = MANAGERS.includes(role);
  const isTechnician = role === "TECHNICIAN";
  const canHandOver = isManager || role === "CUSTOMER_RELATIONS_OFFICER";

  const [tab, setTab] = useState<Tab | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [myJobs, setMyJobs] = useState<Booking[]>([]);
  const [bills, setBills] = useState<Record<number, JobBill>>({});
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [assigning, setAssigning] = useState<Booking | null>(null);
  const [completing, setCompleting] = useState<Booking | null>(null);
  const [viewing, setViewing] = useState<Booking | null>(null);
  const [rescheduling, setRescheduling] = useState<Booking | null>(null);
  const [newTime, setNewTime] = useState("");
  const [creating, setCreating] = useState(false);

  const load = () => {
    api.get<Booking[]>("/bookings").then(res => setBookings(res.data)).catch(() => setBookings([]));
    if (isTechnician) api.get<Booking[]>("/bookings/my-jobs").then(res => setMyJobs(res.data)).catch(() => setMyJobs([]));
    // Payment state of finished jobs (technicians don't have access to billing).
    else api.get<(JobBill & { sourceType: string; sourceId: number })[]>("/invoices")
      .then(res => setBills(Object.fromEntries(res.data.filter(i => i.sourceType === "SERVICE_JOB").map(i => [i.sourceId, i]))))
      .catch(() => setBills({}));
  };

  useEffect(() => {
    if (!user) return;
    setTab(prev => prev ?? (isTechnician ? "mine" : "requests"));
    load();
  }, [user]);

  const flash = (type: "ok" | "error", text: string) => {
    setNotice({ type, text });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const act = async (b: Booking, path: string, done: string, body?: object) => {
    try {
      await api.put(`/bookings/${b.bookingID}/${path}`, body ?? {});
      flash("ok", done);
      load();
    } catch (err) {
      flash("error", errorText(err, "That action failed."));
    }
  };

  const cancel = (b: Booking) => {
    const reason = prompt(`Cancel ${jobRef(b.bookingID)} (${b.vehicleRegNo})? Reason (sent to the customer):`);
    if (reason === null) return;
    act(b, "cancel", `${jobRef(b.bookingID)} cancelled.`, { reason });
  };

  const delay = (b: Booking) => {
    const reason = prompt(`Why is ${jobRef(b.bookingID)} delayed? (sent to the customer)`);
    if (reason === null) return;
    act(b, "delay", `${jobRef(b.bookingID)} marked delayed — the customer has been told.`, { reason });
  };

  const remove = async (b: Booking) => {
    if (!confirm(`Permanently delete cancelled ${jobRef(b.bookingID)}?`)) return;
    try {
      await api.delete(`/bookings/${b.bookingID}`);
      flash("ok", "Cancelled booking removed.");
      load();
    } catch (err) {
      flash("error", errorText(err, "Couldn't delete."));
    }
  };

  const saveReschedule = async () => {
    if (!rescheduling || !newTime) return;
    await act(rescheduling, "reschedule", `${jobRef(rescheduling.bookingID)} moved to ${fmtWhen(newTime)} — re-confirm the technician.`, { preferredDate: newTime });
    setRescheduling(null);
  };

  const mine = (b: Booking) => b.assignedTechnicianUsername === user?.username;
  const today = isoDate(new Date());

  // Row actions follow the status flow; the server enforces the same rules.
  const actions = (b: Booking) => {
    const canWork = isManager || mine(b);
    const btn = "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap";
    const out: React.ReactNode[] = [];
    switch (b.status) {
      case "PENDING":
        if (isManager) out.push(
          <button key="a" onClick={() => setAssigning(b)} className={`${btn} text-white bg-blue-600 hover:bg-blue-700`}>Confirm & assign</button>,
          <button key="r" onClick={() => { setRescheduling(b); setNewTime(b.preferredDate.slice(0, 16)); }} className={`${btn} text-slate-700 hover:bg-slate-100`}>Reschedule</button>,
          <button key="c" onClick={() => cancel(b)} className={`${btn} text-red-700 hover:bg-red-50`}>Cancel</button>);
        break;
      case "CONFIRMED":
        if (canWork && b.preferredDate.slice(0, 10) <= today) out.push(
          <button key="s" onClick={() => act(b, "start", `${jobRef(b.bookingID)} started.`)} className={`${btn} text-white bg-slate-900 hover:bg-blue-600`}>Start job</button>);
        if (isManager) out.push(
          <button key="a" onClick={() => setAssigning(b)} className={`${btn} text-slate-700 hover:bg-slate-100`}>Reassign</button>,
          <button key="r" onClick={() => { setRescheduling(b); setNewTime(b.preferredDate.slice(0, 16)); }} className={`${btn} text-slate-700 hover:bg-slate-100`}>Reschedule</button>,
          <button key="c" onClick={() => cancel(b)} className={`${btn} text-red-700 hover:bg-red-50`}>Cancel</button>);
        break;
      case "IN_PROGRESS":
        if (isManager && !b.assignedBy) out.push(
          <button key="al" onClick={() => setAssigning(b)} className={`${btn} text-white bg-amber-600 hover:bg-amber-700`}>Allocate technician</button>);
        if (canWork) out.push(
          <button key="f" onClick={() => setCompleting(b)} className={`${btn} text-white bg-blue-600 hover:bg-blue-700`}>Complete</button>,
          <button key="d" onClick={() => delay(b)} className={`${btn} text-orange-800 hover:bg-orange-50`}>Delay</button>);
        if (isManager) out.push(<button key="c" onClick={() => cancel(b)} className={`${btn} text-red-700 hover:bg-red-50`}>Abort</button>);
        break;
      case "DELAYED":
        if (canWork) out.push(
          <button key="re" onClick={() => act(b, "resume", `${jobRef(b.bookingID)} resumed.`)} className={`${btn} text-white bg-slate-900 hover:bg-blue-600`}>Resume</button>,
          <button key="f" onClick={() => setCompleting(b)} className={`${btn} text-blue-700 hover:bg-blue-50`}>Complete</button>);
        if (isManager) out.push(<button key="c" onClick={() => cancel(b)} className={`${btn} text-red-700 hover:bg-red-50`}>Abort</button>);
        break;
      case "PAID":
        if (canHandOver && !b.handedOverAt) out.push(
          <button key="h" onClick={() => act(b, "handover", `${jobRef(b.bookingID)} handed over to the customer.`)} className={`${btn} text-white bg-emerald-600 hover:bg-emerald-700`}>Hand over vehicle</button>);
        break;
      case "CANCELLED":
        if (isManager) out.push(
          <button key="q" onClick={() => act(b, "requeue", `${jobRef(b.bookingID)} re-opened as a request.`)} className={`${btn} text-slate-700 hover:bg-slate-100`}>Re-open</button>,
          <button key="x" onClick={() => remove(b)} className={`${btn} text-red-700 hover:bg-red-50`}>Delete</button>);
        break;
    }
    return out;
  };

  const tabs: { key: Tab; label: string; count?: number }[] = isManager ? [
    { key: "requests", label: "Requests", count: bookings.filter(b => b.status === "PENDING").length },
    { key: "workshop", label: "Workshop", count: bookings.filter(b => ["CONFIRMED", "IN_PROGRESS", "DELAYED"].includes(b.status)).length },
    { key: "completed", label: "Completed", count: bookings.filter(needsClosing).length },
    { key: "all", label: "All Jobs" },
    { key: "packages", label: "Packages" },
  ] : isTechnician ? [
    { key: "mine", label: "My Jobs", count: myJobs.filter(b => ACTIVE_STATUSES.includes(b.status)).length },
    { key: "history", label: "My History" },
    { key: "board", label: "Workshop Board" },
  ] : [{ key: "all", label: "All Jobs" }];

  const rows = useMemo(() => {
    let list: Booking[];
    switch (tab) {
      case "requests": list = bookings.filter(b => b.status === "PENDING"); break;
      case "workshop": list = bookings.filter(b => ["CONFIRMED", "IN_PROGRESS", "DELAYED"].includes(b.status)); break;
      case "completed": list = bookings.filter(needsClosing); break;
      case "mine": list = myJobs.filter(b => ACTIVE_STATUSES.includes(b.status)); break;
      case "history": list = myJobs.filter(b => !ACTIVE_STATUSES.includes(b.status)); break;
      case "board": list = bookings.filter(b => ["CONFIRMED", "IN_PROGRESS", "DELAYED"].includes(b.status)); break;
      default: list = bookings;
    }
    const q = search.trim().toLowerCase();
    const upcomingFirst = tab === "requests" || tab === "workshop" || tab === "mine" || tab === "board";
    return list
      .filter(b => tab !== "all" || statusFilter === "ALL" || b.status === statusFilter)
      .filter(b => !q || [jobRef(b.bookingID), b.vehicleRegNo, b.servicePackage, b.technicianName, b.customerUsername].some(v => v?.toLowerCase().includes(q)))
      .sort((a, b) => upcomingFirst ? a.preferredDate.localeCompare(b.preferredDate) : b.preferredDate.localeCompare(a.preferredDate));
  }, [tab, bookings, myJobs, search, statusFilter]);

  if (!user || !tab) return null;

  return (
    <div className="min-h-[calc(100vh-72px)] bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Workshop Job Cards</h1>
            <p className="text-sm font-semibold text-slate-500 mt-1">
              {isManager ? "Confirm bookings, allocate rostered technicians and bays, then follow each job through completion, payment and hand-over."
                : isTechnician ? "Your assigned jobs: start, update the customer, and complete with parts and a report."
                : "Read-only view of workshop jobs."}
            </p>
          </div>
          {isManager && (
            <button onClick={() => setCreating(true)} className="px-6 py-3 bg-slate-900 hover:bg-blue-600 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition-all">
              + Walk-in Job
            </button>
          )}
        </div>

        <Notice notice={notice} />

        <div className="flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
          {tabs.map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px ${tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              {t.label}{t.count ? <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] tabular-nums">{t.count}</span> : null}
            </button>
          ))}
        </div>

        {tab === "packages" ? <PackageManager /> : (
          <>
            <div className="flex flex-wrap gap-3">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search job, vehicle, package, technician..." aria-label="Search jobs"
                className="flex-1 min-w-[220px] px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              {tab === "all" && (
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Status filter"
                  className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-blue-500">
                  <option value="ALL">All statuses</option>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              )}
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-widest font-black">
                      <th className="px-5 py-4">Job</th>
                      <th className="px-5 py-4">Vehicle & service</th>
                      <th className="px-5 py-4">Appointment</th>
                      <th className="px-5 py-4">Technician / bay</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map(b => (
                      <tr key={b.bookingID} className={`align-top hover:bg-slate-50 ${b.status === "DELAYED" ? "bg-orange-50/40" : ""}`}>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <button onClick={() => setViewing(b)} className="font-mono text-xs font-bold text-blue-700 hover:underline">{jobRef(b.bookingID)}</button>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">{b.customerUsername ? "Online" : "Walk-in"}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-black text-slate-900 font-mono">{b.vehicleRegNo}</p>
                          <p className="text-slate-700">{b.servicePackage}</p>
                          {b.customerNotes && <p className="text-xs text-amber-800 mt-1 line-clamp-2">“{b.customerNotes}”</p>}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <p className={`font-bold ${b.preferredDate.slice(0, 10) === today ? "text-blue-700" : "text-slate-900"}`}>{fmtWhen(b.preferredDate)}</p>
                          {b.quotedPrice != null && <p className="text-xs text-slate-500 tabular-nums">Quoted {rupees(b.quotedPrice)}</p>}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-900">{b.technicianName || <span className="text-slate-400 font-medium">Unassigned</span>}</p>
                          <p className="text-xs text-slate-500">{b.assignedServiceBay || "—"}</p>
                        </td>
                        <td className="px-5 py-4">
                          <BookingStatusBadge status={b.status} />
                          {b.status === "DELAYED" && b.delayReason && <p className="text-xs text-orange-800 mt-1 max-w-[200px]">{b.delayReason}</p>}
                          {(b.status === "IN_PROGRESS" || b.status === "DELAYED") && !b.assignedBy && <p className="text-xs font-bold text-amber-700 mt-1">Not allocated by the manager</p>}
                          {b.status === "COMPLETED" && (
                            <p className="text-xs font-bold text-amber-700 mt-1 tabular-nums">
                              Awaiting payment · {rupees(bills[b.bookingID]?.balanceDue ?? b.netTotal)}
                              {bills[b.bookingID] && <span className="block font-mono font-medium text-slate-500">{bills[b.bookingID].invoiceNumber}</span>}
                            </p>
                          )}
                          {b.status === "PAID" && (
                            <p className="text-xs font-bold text-emerald-700 mt-1 tabular-nums">
                              {rupees(b.netTotal)}{bills[b.bookingID]?.paidVia ? ` · ${bills[b.bookingID].paidVia}` : ""}
                              <span className={`block font-medium ${b.handedOverAt ? "text-slate-500" : "text-blue-700 font-bold"}`}>
                                {b.handedOverAt ? `Handed over ${fmtWhen(b.handedOverAt)}` : "Paid — vehicle waiting to be handed over"}
                              </span>
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {actions(b)}
                            {(b.status === "COMPLETED" || b.status === "PAID") && (
                              <button onClick={() => setViewing(b)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-50">View report</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={6} className="p-12 text-center text-slate-500 font-bold">
                        {tab === "requests" ? "No bookings waiting for confirmation." : tab === "mine" ? "No jobs assigned to you right now."
                          : tab === "completed" ? "No finished jobs waiting for payment or hand-over." : "No jobs found."}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {assigning && <AssignDialog booking={assigning} onClose={() => setAssigning(null)} onSaved={msg => { setAssigning(null); flash("ok", msg); load(); }} />}
      {completing && <CompleteJobDialog booking={completing} onClose={() => setCompleting(null)} onSaved={msg => { setCompleting(null); flash("ok", msg); load(); }} />}
      {viewing && <JobDetailDialog booking={viewing} onClose={() => setViewing(null)} />}
      {creating && (
        <NewJobDialog onClose={() => setCreating(false)} onCreated={b => { setCreating(false); load(); setAssigning(b); }} />
      )}
      {rescheduling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="rs-title">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-md w-full border border-slate-200 space-y-4">
            <h3 id="rs-title" className="text-xl font-black text-slate-900">Reschedule {jobRef(rescheduling.bookingID)}</h3>
            <p className="text-sm text-slate-500">Moving a booking releases its technician and bay; confirm it again afterwards. The customer is emailed.</p>
            <label htmlFor="rs-time" className="block text-xs font-bold text-slate-700">New time</label>
            <input id="rs-time" type="datetime-local" value={newTime} onChange={e => setNewTime(e.target.value)} className={inputClass} />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRescheduling(null)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button onClick={saveReschedule} disabled={!newTime} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">Move</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
