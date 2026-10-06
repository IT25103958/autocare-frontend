"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "../../utils/axiosInstance";
import { highlightFocusTarget } from "../../utils/focusTarget";
import { fmtWhen, lkr } from "../billing/_components/billing";

interface Finding {
  attendant: string;
  metric: "VOID_RATE" | "CASH_SHORT" | "UNRECORDED_LITERS";
  value: number;
  typical: number;
  sample: number;
  severity: "HIGH" | "MEDIUM";
}

interface ShiftRow {
  id: number;
  startedAt: string;
  endedAt: string;
  pump: number;
  expectedCash: number;
  declaredCash: number;
  variance: number;
  meterLiters: number | null;
  recordedLiters: number | null;
  unrecordedLiters: number | null;
  status: string;
}

interface VoidRow {
  saleId: number;
  saleDate: string;
  fuelType: string;
  liters: number;
  amount: number;
  reason: string | null;
  voidedBy: string | null;
}

interface Evidence {
  attendant: string;
  windowDays: number;
  findings: Finding[];
  totalSales: number;
  voidedSales: VoidRow[];
  shifts: ShiftRow[];
}

// Same lines the backend uses to call a shift worth a look (AttendantAnomalyService).
const SHORT_RS = 300;
const UNRECORDED_L = 2;

function findingText(f: Finding) {
  switch (f.metric) {
    case "VOID_RATE": return `Voided ${(f.value * 100).toFixed(0)}% of ${f.sample} sales — the others' median is ${(f.typical * 100).toFixed(0)}%.`;
    case "CASH_SHORT": return `Short ${lkr(f.value)} per shift on average over ${f.sample} shifts — the others' median is ${lkr(f.typical)}.`;
    default: return `${f.value.toFixed(1)} L per shift left the pump without a sale, over ${f.sample} shifts — the others' median is ${f.typical.toFixed(1)} L.`;
  }
}

const FINDING_TITLE: Record<Finding["metric"], string> = {
  VOID_RATE: "Voided sales",
  CASH_SHORT: "Cash short at shift end",
  UNRECORDED_LITERS: "Fuel leaving the pump without a sale",
};

export default function AttendantReviewPage() {
  return (
    <Suspense fallback={null}>
      <AttendantReview />
    </Suspense>
  );
}

// The records behind an attendant's risk alerts: every shift and every voided sale
// in the period the alert looked at. Opened from "Review" on the alert, scrolled to
// the section that alert is about.
function AttendantReview() {
  const name = useSearchParams().get("name") ?? "";
  const [data, setData] = useState<Evidence | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!name) return;
    api.get<Evidence>(`/insights/attendants/${encodeURIComponent(name)}/evidence`)
      .then(res => setData(res.data))
      .catch(() => setError("Couldn't load this attendant's records."));
  }, [name]);

  useEffect(() => highlightFocusTarget(), []);

  const shortShifts = data?.shifts.filter(s => s.variance < -SHORT_RS).length ?? 0;
  const gapShifts = data?.shifts.filter(s => (s.unrecordedLiters ?? 0) >= UNRECORDED_L).length ?? 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <Link href="/dashboard" className="text-xs font-bold text-blue-700 hover:underline">← Back to the dashboard</Link>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-2">Attendant review: {name || "—"}</h1>
          {data && (
            <p className="text-slate-500 font-medium mt-1">
              Last {data.windowDays} days · {data.totalSales} sales · {data.shifts.length} shifts
            </p>
          )}
        </div>

        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          These records raise a question; they don&apos;t prove anything on their own. Check the void reasons and the shift counts with the
          attendant and the supervisor before acting.
        </p>

        {!name && <p className="text-sm font-bold text-red-700">No attendant given.</p>}
        {error && <p className="text-sm font-bold text-red-700">{error}</p>}
        {name && !data && !error && <div className="h-32 rounded-3xl bg-slate-100 animate-pulse" />}

        {data && (
          <>
            {data.findings.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.findings.map(f => (
                  <div key={f.metric} className={`rounded-3xl border p-5 ${f.severity === "HIGH" ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60"}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{FINDING_TITLE[f.metric]}</p>
                    <p className="text-sm text-slate-800 mt-2">{findingText(f)}</p>
                  </div>
                ))}
              </div>
            )}

            <section data-focus="shifts" aria-labelledby="shifts-title" className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 id="shifts-title" className="font-black text-slate-900">Shifts</h2>
                <p className="text-xs text-slate-500">{shortShifts} short by more than {lkr(SHORT_RS)} · {gapShifts} with {UNRECORDED_L} L or more not rung up. Those rows are marked red.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-50 bg-slate-50">
                      <th scope="col" className="text-left px-5 py-2">Shift</th>
                      <th scope="col" className="text-right px-4 py-2">Pump</th>
                      <th scope="col" className="text-right px-4 py-2">Expected cash</th>
                      <th scope="col" className="text-right px-4 py-2">Counted</th>
                      <th scope="col" className="text-right px-4 py-2">Difference</th>
                      <th scope="col" className="text-right px-4 py-2">Meter / rung up</th>
                      <th scope="col" className="text-right px-4 py-2">Not rung up</th>
                      <th scope="col" className="text-left px-5 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.shifts.map(s => {
                      const short = s.variance < -SHORT_RS;
                      const gap = (s.unrecordedLiters ?? 0) >= UNRECORDED_L;
                      return (
                        <tr key={s.id} className={`border-b border-slate-50 ${short || gap ? "bg-red-50/40" : ""}`}>
                          <td className="px-5 py-2.5 whitespace-nowrap text-slate-700">{fmtWhen(s.startedAt)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{s.pump}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{lkr(s.expectedCash)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{lkr(s.declaredCash)}</td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${short ? "text-red-700" : s.variance > 0 ? "text-emerald-700" : "text-slate-700"}`}>
                            {s.variance < 0 ? "−" : s.variance > 0 ? "+" : ""}{lkr(Math.abs(s.variance))}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
                            {s.meterLiters != null && s.recordedLiters != null ? `${s.meterLiters.toFixed(1)} / ${s.recordedLiters.toFixed(1)} L` : "—"}
                          </td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${gap ? "text-red-700" : "text-slate-700"}`}>
                            {s.unrecordedLiters != null ? `${s.unrecordedLiters.toFixed(1)} L` : "—"}
                          </td>
                          <td className="px-5 py-2.5 text-xs font-bold text-slate-500">{s.status.replace(/_/g, " ")}</td>
                        </tr>
                      );
                    })}
                    {data.shifts.length === 0 && <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-500">No shifts in this period.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section data-focus="voids" aria-labelledby="voids-title" className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 id="voids-title" className="font-black text-slate-900">Voided sales</h2>
                <p className="text-xs text-slate-500">{data.voidedSales.length} of {data.totalSales} sales voided, newest first.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-50 bg-slate-50">
                      <th scope="col" className="text-left px-5 py-2">When</th>
                      <th scope="col" className="text-left px-4 py-2">Fuel</th>
                      <th scope="col" className="text-right px-4 py-2">Litres</th>
                      <th scope="col" className="text-right px-4 py-2">Amount</th>
                      <th scope="col" className="text-left px-4 py-2">Reason given</th>
                      <th scope="col" className="text-left px-5 py-2">Voided by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.voidedSales.map(v => (
                      <tr key={v.saleId} className="border-b border-slate-50">
                        <td className="px-5 py-2.5 whitespace-nowrap text-slate-700">{fmtWhen(v.saleDate)}</td>
                        <td className="px-4 py-2.5">{v.fuelType}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{v.liters.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{lkr(v.amount)}</td>
                        <td className="px-4 py-2.5 text-slate-700">{v.reason || "—"}</td>
                        <td className="px-5 py-2.5 text-slate-500">{v.voidedBy || "—"}</td>
                      </tr>
                    ))}
                    {data.voidedSales.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No voided sales in this period.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
