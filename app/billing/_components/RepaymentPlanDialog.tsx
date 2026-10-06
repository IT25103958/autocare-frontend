"use client";

import { useState } from "react";
import api from "../../../utils/axiosInstance";
import { FREQUENCY_LABEL, ReceivableRow, errText, fmtDay, inputClass, isoDate, lkr } from "./billing";

const FREQUENCIES = [
  { key: "WEEKLY", label: "Weekly" },
  { key: "FORTNIGHTLY", label: "Every 2 weeks" },
  { key: "MONTHLY", label: "Monthly" },
];

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DUE: "bg-blue-50 text-blue-700 border-blue-200",
  OVERDUE: "bg-red-50 text-red-700 border-red-200",
  UPCOMING: "bg-slate-50 text-slate-600 border-slate-200",
};

const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
};

// Agree an instalment schedule for an unpaid bill, or review / change / remove
// the one it already has. Payments are still taken with "Collect payment".
export default function RepaymentPlanDialog({ row, canManage, onClose, onSaved }: {
  row: ReceivableRow;
  canManage: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { invoice, plan } = row;
  const [installments, setInstallments] = useState(String(plan?.installments ?? 3));
  const [frequency, setFrequency] = useState<string>(plan?.frequency ?? "MONTHLY");
  const [firstDueDate, setFirstDueDate] = useState(plan && plan.firstDueDate >= addDays(0) ? plan.firstDueDate : addDays(7));
  const [note, setNote] = useState(plan?.note ?? "");
  const [editing, setEditing] = useState(!plan);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const n = Math.floor(Number(installments) || 0);
  const each = n >= 2 ? Math.floor((invoice.balanceDue / n) * 100) / 100 : 0;
  const invalid = saving || n < 2 || n > 24 || !firstDueDate || invoice.balanceDue < n;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.put(`/invoices/${invoice.invoiceId}/plan`, { installments: n, frequency, firstDueDate, note: note || null });
      onSaved(`${invoice.invoiceNumber}: repayment plan ${plan ? "updated" : "set"} — ${n} ${FREQUENCY_LABEL[frequency]} instalments of ${lkr(each)}.`);
    } catch (err) {
      setError(errText(err, "Couldn't save the repayment plan."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError("");
    try {
      await api.delete(`/invoices/${invoice.invoiceId}/plan`);
      onSaved(`${invoice.invoiceNumber}: repayment plan removed — the balance is due in full.`);
    } catch (err) {
      setError(errText(err, "Couldn't remove the repayment plan."));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="plan-title">
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-lg w-full border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
        <div>
          <h3 id="plan-title" className="text-xl font-black text-slate-900">Repayment Plan</h3>
          <p className="text-sm text-slate-500 mt-1">{invoice.invoiceNumber} · {invoice.customerName} · {lkr(invoice.balanceDue)} due</p>
        </div>

        {plan && !editing && (
          <>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm space-y-1">
              <p className="font-bold text-slate-900">{plan.installments} {FREQUENCY_LABEL[plan.frequency]} instalments of {lkr(plan.installmentAmount)}</p>
              <p className="text-slate-600">{plan.installmentsPaid} of {plan.installments} paid · {lkr(plan.paidTowardsPlan)} of {lkr(plan.plannedAmount)}</p>
              {plan.overdueAmount > 0
                ? <p className="font-bold text-red-700">{plan.overdueCount} instalment{plan.overdueCount > 1 ? "s" : ""} overdue — {lkr(plan.overdueAmount)}</p>
                : plan.nextDueDate && <p className="text-slate-600">Next: {lkr(plan.nextDueAmount)} on {fmtDay(plan.nextDueDate)}</p>}
              {plan.note && <p className="text-slate-600 italic">“{plan.note}”</p>}
              <p className="text-xs text-slate-500">Agreed by {plan.createdBy} on {fmtDay(plan.createdAt)}</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
                  <th className="text-left py-2">#</th><th className="text-left py-2">Due</th><th className="text-right py-2">Amount</th><th className="text-right py-2">Paid</th><th className="text-right py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {plan.schedule.map(i => (
                  <tr key={i.number} className="border-b border-slate-50">
                    <td className="py-2 text-slate-500">{i.number}</td>
                    <td className="py-2">{fmtDay(i.dueDate)}</td>
                    <td className="py-2 text-right tabular-nums">{lkr(i.amount)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{lkr(i.paid)}</td>
                    <td className="py-2 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${STATUS_STYLE[i.status]}`}>{i.status === "DUE" ? "Next" : i.status.toLowerCase()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {error && <p role="alert" className="text-sm font-bold text-red-600">{error}</p>}
            <div className="flex flex-wrap justify-end gap-3">
              {canManage && <button type="button" onClick={remove} disabled={saving} className="mr-auto px-4 py-2.5 rounded-xl text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">Remove plan</button>}
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Close</button>
              {canManage && <button type="button" onClick={() => setEditing(true)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700">Change plan</button>}
            </div>
          </>
        )}

        {editing && (
          <form onSubmit={save} className="space-y-4">
            {plan && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">Changing the plan spreads the {lkr(invoice.balanceDue)} still owed over a new schedule.</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="rp-count" className="block text-xs font-bold text-slate-700 mb-1">Instalments (2–24)</label>
                <input id="rp-count" type="number" min={2} max={24} value={installments} onChange={e => setInstallments(e.target.value)} className={`${inputClass} tabular-nums font-bold`} />
              </div>
              <div>
                <label htmlFor="rp-first" className="block text-xs font-bold text-slate-700 mb-1">First instalment due</label>
                <input id="rp-first" type="date" min={addDays(0)} max={addDays(60)} value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} className={inputClass} />
              </div>
            </div>
            <fieldset>
              <legend className="block text-xs font-bold text-slate-700 mb-2">How often</legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup">
                {FREQUENCIES.map(f => (
                  <button key={f.key} type="button" role="radio" aria-checked={frequency === f.key} onClick={() => setFrequency(f.key)}
                    className={`py-2.5 rounded-xl text-sm font-bold border-2 ${frequency === f.key ? "border-blue-600 bg-blue-50/60 text-blue-800" : "border-slate-100 text-slate-700 hover:border-slate-300"}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="rp-note" className="block text-xs font-bold text-slate-700 mb-1">Note <span className="font-medium text-slate-500">(optional)</span></label>
              <input id="rp-note" value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="e.g. Agreed by phone with the customer" className={inputClass} />
            </div>
            {n >= 2 && n <= 24 && (
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3">
                {n} {FREQUENCY_LABEL[frequency]} instalments of about <span className="font-black tabular-nums">{lkr(each)}</span>, starting {fmtDay(firstDueDate)}.
              </p>
            )}
            {invoice.balanceDue < n && <p className="text-sm font-bold text-red-600">The balance is too small to split into {n} instalments.</p>}
            {error && <p role="alert" className="text-sm font-bold text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={plan ? () => setEditing(false) : onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">{plan ? "Back" : "Cancel"}</button>
              <button type="submit" disabled={invalid} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving..." : plan ? "Save new plan" : "Set plan"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
