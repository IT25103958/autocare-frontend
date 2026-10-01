"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { Invoice, InvoiceDetail, errText, inputClass, lkr, paymentText } from "./billing";

const METHODS = [
  { key: "CASH", label: "Cash" },
  { key: "CARD", label: "Card (terminal)" },
  { key: "BANK_TRANSFER", label: "Bank transfer" },
];

// Counter payment for an invoice: optional loyalty points first, then cash
// (with change), card or bank transfer. Partial payments are allowed.
export default function CollectPaymentDialog({ invoice, onClose, onPaid }: {
  invoice: Invoice;
  onClose: () => void;
  onPaid: (message: string, paidInFull: boolean) => void;
}) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [method, setMethod] = useState("CASH");
  const [points, setPoints] = useState("");
  const [amount, setAmount] = useState(String(invoice.balanceDue));
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<InvoiceDetail>(`/invoices/${invoice.invoiceId}`).then(res => setDetail(res.data)).catch(() => setDetail(null));
  }, [invoice.invoiceId]);

  const pointValue = detail?.pointValue ?? 1;
  const pts = Math.max(0, Math.floor(Number(points) || 0));
  const pointsWorth = Math.round(pts * pointValue * 100) / 100;
  const afterPoints = Math.max(0, Math.round((invoice.balanceDue - pointsWorth) * 100) / 100);
  const maxPoints = detail ? Math.min(detail.loyaltyPoints, Math.floor(invoice.balanceDue / pointValue)) : 0;
  const amt = Number(amount) || 0;
  const change = method === "CASH" && tendered ? Math.round((Number(tendered) - amt) * 100) / 100 : 0;

  // Keep the amount in step with points unless the cashier typed a partial amount.
  const setPointsAndAmount = (value: string) => {
    setPoints(value);
    const p = Math.max(0, Math.floor(Number(value) || 0));
    setAmount(String(Math.max(0, Math.round((invoice.balanceDue - p * pointValue) * 100) / 100)));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api.post<{ invoice: Invoice; changeGiven: number }>(`/invoices/${invoice.invoiceId}/payments`, {
        method,
        amount: amt,
        amountTendered: method === "CASH" && tendered ? Number(tendered) : null,
        reference: reference || null,
        pointsToRedeem: pts || null,
      });
      const paidInFull = res.data.invoice.status === "PAID";
      onPaid(`${invoice.invoiceNumber}: ${paidInFull ? "paid in full" : `${lkr(res.data.invoice.balanceDue)} still due`}${res.data.changeGiven > 0 ? ` — give change ${lkr(res.data.changeGiven)}` : ""}.`, paidInFull);
    } catch (err) {
      setError(errText(err, "Couldn't record the payment."));
    } finally {
      setSaving(false);
    }
  };

  // Every counter payment carries its proof: the cash handed over, the card
  // terminal's slip number, or the bank transfer reference.
  const invalid = saving || (amt <= 0 && pts <= 0) || amt > afterPoints + 0.001
    || (method === "CASH" && amt > 0 && (!tendered || Number(tendered) < amt))
    || (method !== "CASH" && amt > 0 && reference.trim().length < 4)
    || pts > maxPoints;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="collect-title">
      <form onSubmit={save} className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-lg w-full border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
        <div>
          <h3 id="collect-title" className="text-xl font-black text-slate-900">Collect Payment</h3>
          <p className="text-sm text-slate-500 mt-1">{invoice.invoiceNumber} · {invoice.customerName} · {invoice.description}</p>
        </div>

        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 grid grid-cols-3 gap-3 text-sm">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total</p><p className="font-black tabular-nums">{lkr(invoice.totalAmount)}</p></div>
          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Paid</p><p className="font-black tabular-nums">{lkr(invoice.amountPaid)}</p></div>
          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Due</p><p className="font-black tabular-nums text-red-700">{lkr(invoice.balanceDue)}</p></div>
        </div>

        {detail && detail.payments.length > 0 && (
          <ul className="text-xs text-slate-600 space-y-1">
            {detail.payments.map(p => <li key={p.paymentId}>{p.receiptNumber} · {paymentText(p)} · <span className="font-bold tabular-nums">{lkr(p.amount)}</span></li>)}
          </ul>
        )}

        {detail && detail.loyaltyPoints > 0 && (
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50/60 p-4">
            <label htmlFor="cp-points" className="block text-xs font-bold text-slate-800 mb-1">
              Redeem loyalty points <span className="font-medium text-slate-600">({detail.loyaltyPoints.toLocaleString()} available · 1 pt = {lkr(pointValue)})</span>
            </label>
            <div className="flex items-center gap-3">
              <input id="cp-points" type="number" min={0} max={maxPoints} value={points} onChange={e => setPointsAndAmount(e.target.value)} placeholder="0" className={`${inputClass} w-32 tabular-nums`} />
              <button type="button" onClick={() => setPointsAndAmount(String(maxPoints))} className="text-xs font-bold text-blue-700 hover:underline">Use max ({maxPoints})</button>
              {pts > 0 && <span className="text-sm font-bold text-emerald-700 tabular-nums">−{lkr(pointsWorth)}</span>}
            </div>
            {pts > maxPoints && <p className="text-xs font-bold text-red-600 mt-1">At most {maxPoints} points can be used on this bill.</p>}
          </div>
        )}

        <fieldset>
          <legend className="block text-xs font-bold text-slate-700 mb-2">Method</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {METHODS.map(m => (
              <button key={m.key} type="button" role="radio" aria-checked={method === m.key} onClick={() => setMethod(m.key)}
                className={`py-2.5 rounded-xl text-sm font-bold border-2 ${method === m.key ? "border-blue-600 bg-blue-50/60 text-blue-800" : "border-slate-100 text-slate-700 hover:border-slate-300"}`}>
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cp-amount" className="block text-xs font-bold text-slate-700 mb-1">Amount (max {lkr(afterPoints)})</label>
            <input id="cp-amount" type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={`${inputClass} tabular-nums font-bold`} />
          </div>
          {method === "CASH" && (
            <div>
              <label htmlFor="cp-tendered" className="block text-xs font-bold text-slate-700 mb-1">Cash handed over</label>
              <input id="cp-tendered" type="number" min={0} step="0.01" value={tendered} onChange={e => setTendered(e.target.value)} placeholder="Required" className={`${inputClass} tabular-nums`} />
            </div>
          )}
          {method === "CARD" && (
            <div>
              <label htmlFor="cp-ref" className="block text-xs font-bold text-slate-700 mb-1">Terminal slip / approval no.</label>
              <input id="cp-ref" value={reference} maxLength={20} onChange={e => setReference(e.target.value)} placeholder="From the card slip" className={`${inputClass} tabular-nums`} />
            </div>
          )}
          {method === "BANK_TRANSFER" && (
            <div>
              <label htmlFor="cp-ref" className="block text-xs font-bold text-slate-700 mb-1">Transfer reference</label>
              <input id="cp-ref" value={reference} maxLength={60} onChange={e => setReference(e.target.value)} className={inputClass} />
            </div>
          )}
        </div>
        {method === "CASH" && change > 0 && <p className="text-lg font-black text-emerald-700">Change: {lkr(change)}</p>}
        {method === "CASH" && !!tendered && Number(tendered) < amt && <p className="text-sm font-bold text-red-600">Cash tendered is less than the amount.</p>}
        {amt > 0 && amt < afterPoints && <p className="text-xs text-amber-800">Partial payment — {lkr(afterPoints - amt)} will remain due.</p>}

        {invoice.customerEmail && <p className="text-xs text-slate-500">The customer is emailed a confirmation of this payment at {invoice.customerEmail}.</p>}
        {error && <p className="text-sm font-bold text-red-600">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={invalid} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "Recording..." : `Record ${lkr(amt + pointsWorth)}`}
          </button>
        </div>
      </form>
    </div>
  );
}
