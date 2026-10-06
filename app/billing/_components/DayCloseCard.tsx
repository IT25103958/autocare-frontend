"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { errText, fmtDay, fmtWhen, inputClass, lkr } from "./billing";

interface DayClose {
  closeId: number;
  businessDate: string;
  expectedCash: number;
  countedCash: number;
  expectedCard: number;
  settledCard: number;
  expectedTransfer: number;
  confirmedTransfer: number;
  cashVariance: number;
  cardVariance: number;
  transferVariance: number;
  note: string | null;
  closedBy: string;
  closedAt: string;
}

interface Reconciliation {
  date: string;
  paymentCount: number;
  cashReceived: number;
  cashExpenses: number;
  expectedCash: number;
  expectedCard: number;
  expectedTransfer: number;
  onlineSettled: number;
  pointsRedeemed: number;
  tolerance: number;
  close: DayClose | null;
  changedSinceClose: boolean;
}

type Line = "cash" | "card" | "transfer";

// End-of-day reconciliation: what the system recorded for each tender next to
// what was counted in the drawer / confirmed with the bank, and the difference.
export default function DayCloseCard({ date, canClose, refreshKey, onClosed }: {
  date: string;
  canClose: boolean;
  refreshKey: number;
  onClosed: (message: string) => void;
}) {
  const [rec, setRec] = useState<Reconciliation | null>(null);
  const [counted, setCounted] = useState<Record<Line, string>>({ cash: "", card: "", transfer: "" });
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let stale = false;
    api.get<Reconciliation>("/finance/reconciliation", { params: { date } }).then(res => {
      if (stale) return;
      const c = res.data.close;
      setRec(res.data);
      setCounted(c ? { cash: String(c.countedCash), card: String(c.settledCard), transfer: String(c.confirmedTransfer) } : { cash: "", card: "", transfer: "" });
      setNote(c?.note ?? "");
      setError("");
    }).catch(() => { if (!stale) setRec(null); });
    return () => { stale = true; };
  }, [date, refreshKey, reload]);

  if (!rec) return null;

  const lines: { key: Line; label: string; hint: string; system: number; countedLabel: string }[] = [
    { key: "cash", label: "Cash", hint: `${lkr(rec.cashReceived)} received − ${lkr(rec.cashExpenses)} cash expenses`, system: rec.expectedCash, countedLabel: "Counted in drawer" },
    { key: "card", label: "Card terminal", hint: "Card payments taken at the counter", system: rec.expectedCard, countedLabel: "Terminal settlement" },
    { key: "transfer", label: "Bank transfer", hint: "Transfers recorded against invoices", system: rec.expectedTransfer, countedLabel: "Seen on bank statement" },
  ];
  const variance = (l: { key: Line; system: number }) => (counted[l.key] === "" ? null : Math.round((Number(counted[l.key]) - l.system) * 100) / 100);
  const offBalance = lines.some(l => Math.abs(variance(l) ?? 0) > rec.tolerance);
  const incomplete = lines.some(l => counted[l.key] === "" || Number(counted[l.key]) < 0);
  const closed = rec.close;

  const close = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/finance/reconciliation", {
        date, countedCash: Number(counted.cash), settledCard: Number(counted.card), confirmedTransfer: Number(counted.transfer), note: note || null,
      });
      onClosed(`${fmtDay(date)} closed — ${offBalance ? "with a variance noted" : "the day balances"}.`);
      setReload(v => v + 1);
    } catch (err) {
      setError(errText(err, "Couldn't close the day."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={close} data-focus="day-close" className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-slate-900">Day-close reconciliation · {fmtDay(date)}</h3>
          <p className="text-xs text-slate-500 mt-1">Compare what the system recorded with what was actually counted. Forecourt cash is reconciled in the fuel shift handovers.</p>
        </div>
        {closed
          ? <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border bg-emerald-50 text-emerald-700 border-emerald-200">Closed by {closed.closedBy} · {fmtWhen(closed.closedAt)}</span>
          : <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border bg-amber-50 text-amber-800 border-amber-200">Not closed</span>}
      </div>

      {rec.changedSinceClose && (
        <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          A payment or cash expense was recorded after this day was closed, so the figures below no longer match the close. Re-count and close the day again.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
              <th className="text-left py-2 pr-4">Tender</th>
              <th className="text-right py-2 px-4">System recorded</th>
              <th className="text-right py-2 px-4">Counted / confirmed</th>
              <th className="text-right py-2 pl-4">Difference</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => {
              const v = variance(l);
              const bad = v !== null && Math.abs(v) > rec.tolerance;
              return (
                <tr key={l.key} className="border-b border-slate-50">
                  <td className="py-3 pr-4"><p className="font-bold text-slate-900">{l.label}</p><p className="text-xs text-slate-500">{l.hint}</p></td>
                  <td className="py-3 px-4 text-right font-black tabular-nums">{lkr(l.system)}</td>
                  <td className="py-3 px-4 text-right">
                    <input type="number" min={0} step="0.01" value={counted[l.key]} disabled={!canClose} aria-label={`${l.label}: ${l.countedLabel}`} placeholder={l.countedLabel}
                      onChange={e => setCounted({ ...counted, [l.key]: e.target.value })} className={`${inputClass} w-44 ml-auto text-right tabular-nums font-bold disabled:opacity-70`} />
                  </td>
                  <td className={`py-3 pl-4 text-right font-black tabular-nums ${v === null ? "text-slate-300" : bad ? "text-red-700" : "text-emerald-700"}`}>
                    {v === null ? "—" : v === 0 ? "Balanced" : `${v > 0 ? "+" : "−"}${lkr(Math.abs(v))}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Not counted here: online card payments {lkr(rec.onlineSettled)} (settled by the gateway) and loyalty points {lkr(rec.pointsRedeemed)} (not money).
        Differences up to {lkr(rec.tolerance)} count as balanced.
      </p>

      {canClose && (
        <>
          <div>
            <label htmlFor="dc-note" className="block text-xs font-bold text-slate-700 mb-1">Note {offBalance ? <span className="text-red-600">(required — explain the difference)</span> : <span className="font-medium text-slate-500">(optional)</span>}</label>
            <input id="dc-note" value={note} maxLength={300} onChange={e => setNote(e.target.value)} className={inputClass} placeholder="e.g. Rs. 500 float left in the drawer for tomorrow" />
          </div>
          {error && <p role="alert" className="text-sm font-bold text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving || incomplete || (offBalance && note.trim().length < 10)}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Closing..." : closed ? "Close day again" : "Close day"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
