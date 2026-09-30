"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import api from "../../../utils/axiosInstance";
import CustomerHistoryDrawer from "../../_components/CustomerHistoryDrawer";
import { Ticket, CATEGORY_NAMES, ticketRef, slaText, PriorityBadge } from "../../_components/crm";

interface Report {
  periodDays: number;
  totalTickets: number;
  resolvedCount: number;
  avgResolutionHours: number | null;
  resolvedWithoutEscalation: number;
  byPriority: Record<string, number>;
  byCategory: Record<string, { count: number; open: number; avgResolutionHours: number | null }>;
  dailyVolume: { date: string; count: number }[];
  repeatCustomers: { customerId: number; name: string; vehicleRegNo: string; ticketCount: number; openCount: number }[];
  openBacklog: number;
  escalatedOpen: number;
  slaBreachedOpen: number;
  urgentOpen: number;
  unassignedOpen: number;
  resolvedToday: number;
}

const PERIODS = [7, 30, 90];

const hours = (h: number | null) => h === null ? "—" : h < 24 ? `${h} h` : `${(h / 24).toFixed(1)} days`;

export default function CrmDashboard({ userName }: { userName?: string }) {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [attention, setAttention] = useState<Ticket[]>([]);
  const [error, setError] = useState("");
  const [historyFor, setHistoryFor] = useState<number | null>(null);

  useEffect(() => {
    api.get<Report>("/complaints/report", { params: { days } })
      .then(res => { setReport(res.data); setError(""); })
      .catch(() => setError("Couldn't load CRM figures."));
  }, [days]);

  useEffect(() => {
    api.get<Ticket[]>("/complaints")
      .then(res => setAttention(res.data
        .filter(t => t.status !== "RESOLVED" && (t.escalated || t.slaBreached || t.priority === "URGENT" || !t.assignedStaff))
        .sort((a, b) => Number(b.slaBreached) - Number(a.slaBreached) || b.escalationLevel - a.escalationLevel)
        .slice(0, 6)))
      .catch(() => setAttention([]));
  }, []);

  const withinSlaRate = report && report.resolvedCount > 0
    ? Math.round((report.resolvedWithoutEscalation / report.resolvedCount) * 100) : null;

  const chartData = report?.dailyVolume.map(d => ({
    ...d,
    label: new Date(d.date + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  })) ?? [];

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">CRM & Support Center</h1>
          <p className="text-sm font-bold text-slate-500 mt-1">Welcome, {userName}. Live customer relations overview.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/customers" className="px-5 py-2.5 bg-white border border-slate-200 text-slate-800 text-sm font-black uppercase tracking-wider rounded-xl hover:bg-slate-50">
            Customers
          </Link>
          <Link href="/membership" className="px-5 py-2.5 bg-white border border-slate-200 text-slate-800 text-sm font-black uppercase tracking-wider rounded-xl hover:bg-slate-50">
            Membership
          </Link>
          <Link href="/complaints" className="px-5 py-2.5 bg-blue-600 text-white text-sm font-black uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700">
            Ticket Desk
          </Link>
        </div>
      </div>

      {error && <p className="text-sm font-bold text-red-600">{error}</p>}

      {/* LIVE BACKLOG KPIs */}
      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Open Tickets</h3>
            <div className="text-3xl font-black text-slate-900 tabular-nums">{report.openBacklog}</div>
            <p className="text-sm font-bold text-slate-500 mt-1">{report.unassignedOpen} awaiting triage</p>
          </div>
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Past SLA</h3>
            <div className={`text-3xl font-black tabular-nums ${report.slaBreachedOpen ? "text-red-700" : "text-slate-900"}`}>{report.slaBreachedOpen}</div>
            <p className="text-sm font-bold text-slate-500 mt-1">{report.escalatedOpen} escalated · {report.urgentOpen} urgent</p>
          </div>
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Resolved Today</h3>
            <div className="text-3xl font-black text-slate-900 tabular-nums">{report.resolvedToday}</div>
            <p className="text-sm font-bold text-slate-500 mt-1">
              {withinSlaRate === null ? "No resolutions in period" : `${withinSlaRate}% resolved without escalation`}
            </p>
          </div>
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Avg. Resolution Time</h3>
            <div className="text-3xl font-black text-slate-900 tabular-nums">{hours(report.avgResolutionHours)}</div>
            <p className="text-sm font-bold text-slate-500 mt-1">Tickets raised in last {report.periodDays} days</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* NEEDS ATTENTION */}
        <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl">
          <h2 className="text-lg font-black mb-4">Needs Attention</h2>
          {attention.length === 0 ? (
            <p className="text-sm text-slate-300">Nothing overdue, escalated or awaiting triage. 🎉</p>
          ) : (
            <ul className="space-y-3">
              {attention.map(t => {
                const sla = slaText(t);
                return (
                  <li key={t.ticketId} className="bg-slate-800 p-3 rounded-xl">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-200">{ticketRef(t.ticketId)}</span>
                      <PriorityBadge priority={t.priority} />
                    </div>
                    <p className="text-sm font-bold text-slate-100 mt-1">{t.customer.name} · {CATEGORY_NAMES[t.category] || t.category}</p>
                    <p className="text-xs text-slate-300 mt-1">
                      {!t.assignedStaff ? "Awaiting triage" : t.assignedStaff}
                      {sla && <> · <span className={sla.overdue ? "text-red-300 font-bold" : ""}>{sla.text}</span></>}
                      {t.escalated && <> · Escalated L{t.escalationLevel}</>}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* VOLUME TREND */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">Tickets Raised per Day</h2>
              {report && <p className="text-sm text-slate-500">{report.totalTickets} tickets in the last {report.periodDays} days</p>}
            </div>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden" role="group" aria-label="Report period">
              {PERIODS.map(p => (
                <button key={p} onClick={() => setDays(p)} aria-pressed={days === p}
                  className={`px-3 py-1.5 text-xs font-bold ${days === p ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {p}d
                </button>
              ))}
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v) => [v, "Tickets"]} labelStyle={{ fontWeight: 700, color: "#0f172a" }} />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* BY DEPARTMENT */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 mb-4">By Department</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
                  <th className="text-left py-2">Department</th>
                  <th className="text-right py-2">Tickets</th>
                  <th className="text-right py-2">Still open</th>
                  <th className="text-right py-2">Avg. resolution</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.byCategory).map(([cat, row]) => (
                  <tr key={cat} className="border-b border-slate-50">
                    <td className="py-2 font-bold text-slate-900">{CATEGORY_NAMES[cat] || cat}</td>
                    <td className="py-2 text-right tabular-nums">{row.count}</td>
                    <td className="py-2 text-right tabular-nums">{row.open}</td>
                    <td className="py-2 text-right tabular-nums">{hours(row.avgResolutionHours)}</td>
                  </tr>
                ))}
                {Object.keys(report.byCategory).length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-500">No tickets in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* REPEAT COMPLAINANTS */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 mb-1">Repeat Complainants</h2>
            <p className="text-sm text-slate-500 mb-4">Customers with 2 or more tickets in the period</p>
            {report.repeatCustomers.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">None — no customer raised more than one ticket.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {report.repeatCustomers.map(c => (
                  <li key={c.customerId}>
                    <button onClick={() => setHistoryFor(c.customerId)} className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 rounded-lg px-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{c.name}</p>
                        <p className="text-xs font-mono text-slate-500">{c.vehicleRegNo}</p>
                      </div>
                      <p className="text-sm tabular-nums text-slate-700"><span className="font-black">{c.ticketCount}</span> tickets · {c.openCount} open</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {historyFor !== null && <CustomerHistoryDrawer customerId={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}
