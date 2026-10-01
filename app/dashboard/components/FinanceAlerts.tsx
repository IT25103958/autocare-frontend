"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";

interface FinanceAlert {
  severity: "HIGH" | "MEDIUM";
  code: string;
  title: string;
  detail: string;
  link: string;
}

const SHOWN = 5;

// Risk & fraud alerts for the finance office: overdue instalments, old unpaid
// invoices, day-close variances, off-hours payments and suspicious expenses.
export default function FinanceAlerts({ refreshKey = 0 }: { refreshKey?: number | string }) {
  const [alerts, setAlerts] = useState<FinanceAlert[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api.get<FinanceAlert[]>("/finance/alerts")
      .then(res => { setAlerts(res.data); setFailed(false); })
      .catch(() => setFailed(true));
  }, [refreshKey]);

  const high = alerts?.filter(a => a.severity === "HIGH").length ?? 0;
  const visible = expanded ? alerts ?? [] : (alerts ?? []).slice(0, SHOWN);

  return (
    <section aria-labelledby="finance-alerts-title" className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 id="finance-alerts-title" className="text-lg font-black text-slate-900">Risk & Fraud Alerts</h3>
          <p className="text-xs font-semibold text-slate-500 mt-1">Checked against the live books: receivables, day-close, counter payments and expenses.</p>
        </div>
        {alerts && alerts.length > 0 && (
          <span className={`px-3 py-1 rounded-full text-xs font-black ${high > 0 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
            {alerts.length} open{high > 0 ? ` · ${high} high` : ""}
          </span>
        )}
      </div>

      {failed && <p className="text-sm font-bold text-red-600">Couldn&apos;t load the alerts.</p>}
      {!failed && alerts === null && <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />}
      {!failed && alerts?.length === 0 && (
        <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-2xl p-4">Nothing needs attention — no overdue receivables, variances or unusual entries.</p>
      )}

      <ul className="space-y-2">
        {visible.map((a, i) => (
          <li key={`${a.code}-${i}`} className={`flex items-start gap-3 rounded-2xl border p-4 ${a.severity === "HIGH" ? "border-red-200 bg-red-50/50" : "border-amber-200 bg-amber-50/50"}`}>
            <span className={`mt-0.5 shrink-0 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${a.severity === "HIGH" ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}>{a.severity === "HIGH" ? "High" : "Check"}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-900">{a.title}</p>
              <p className="text-sm text-slate-600">{a.detail}</p>
            </div>
            <Link href={a.link} className="shrink-0 text-xs font-black uppercase tracking-widest text-blue-700 hover:text-blue-900 whitespace-nowrap">Review</Link>
          </li>
        ))}
      </ul>
      {alerts && alerts.length > SHOWN && (
        <button onClick={() => setExpanded(v => !v)} className="mt-3 text-xs font-bold text-blue-700 hover:underline">
          {expanded ? "Show fewer" : `Show all ${alerts.length} alerts`}
        </button>
      )}
    </section>
  );
}
