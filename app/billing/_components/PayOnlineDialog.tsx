"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../../utils/axiosInstance";
import { FREQUENCY_LABEL, Invoice, InvoiceDetail, errText, fmtDay, lkr } from "./billing";

// First step of paying a bill online: choose what to pay (the instalment due or
// the whole balance) and whether to use loyalty points, then continue to the
// payment gateway. No card or account details are entered here.
export default function PayOnlineDialog({ invoice, onClose, onPaid }: {
  invoice: Invoice;
  onClose: () => void;
  onPaid: (message: string) => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [payFull, setPayFull] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<InvoiceDetail>(`/invoices/${invoice.invoiceId}`).then(res => setDetail(res.data)).catch(() => setDetail(null));
  }, [invoice.invoiceId]);

  // On a repayment plan the customer pays what's due now, unless they choose to clear the bill.
  const plan = detail?.plan ?? null;
  const hasInstalment = !!plan && plan.amountDueNow > 0 && plan.amountDueNow < invoice.balanceDue;
  const instalment = hasInstalment && !payFull;
  const target = plan && instalment ? plan.amountDueNow : invoice.balanceDue;
  const pointValue = detail?.pointValue ?? 1;
  const maxPoints = detail ? Math.min(detail.loyaltyPoints, Math.floor(target / pointValue)) : 0;
  const points = usePoints ? maxPoints : 0;
  const pointsWorth = Math.round(points * pointValue * 100) / 100;
  const toCharge = Math.max(0, Math.round((target - pointsWorth) * 100) / 100);

  const proceed = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{ paid: boolean; token?: string }>(`/invoices/${invoice.invoiceId}/checkout`, {
        amount: instalment ? toCharge : null,
        pointsToRedeem: points || null,
      });
      if (res.data.paid) {
        onPaid(`${invoice.invoiceNumber}: ${lkr(pointsWorth)} paid with your points.`);
      } else {
        router.push(`/pay/${res.data.token}`);
      }
    } catch (err) {
      setError(errText(err, "Couldn't start the payment. Please try again."));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="payonline-title">
      <form onSubmit={proceed} className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="bg-slate-900 text-white p-6">
          <p className="text-xs font-black uppercase tracking-widest text-slate-300">Pay online</p>
          <h3 id="payonline-title" className="text-2xl font-black mt-1">{lkr(toCharge)}</h3>
          <p className="text-sm text-slate-300 mt-1">{invoice.invoiceNumber} · {invoice.description}</p>
        </div>

        <div className="p-6 space-y-4">
          {plan && hasInstalment && (
            <fieldset className="rounded-xl border border-slate-200 p-3 space-y-2">
              <legend className="px-1 text-xs font-bold text-slate-700">Repayment plan · {plan.installmentsPaid} of {plan.installments} {FREQUENCY_LABEL[plan.frequency]} instalments paid</legend>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="po-what" checked={!payFull} onChange={() => setPayFull(false)} className="w-4 h-4 mt-0.5" />
                <span className="text-sm text-slate-800">
                  <span className="font-bold">{lkr(plan.amountDueNow)}</span> — {plan.overdueAmount > 0 ? <span className="font-bold text-red-700">overdue</span> : <>instalment due {fmtDay(plan.nextDueDate)}</>}
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="po-what" checked={payFull} onChange={() => setPayFull(true)} className="w-4 h-4 mt-0.5" />
                <span className="text-sm text-slate-800"><span className="font-bold">{lkr(invoice.balanceDue)}</span> — pay the whole balance</span>
              </label>
            </fieldset>
          )}

          {detail && detail.loyaltyPoints > 0 && maxPoints > 0 && (
            <label className="flex items-start gap-3 p-3 rounded-xl border border-yellow-200 bg-yellow-50/60 cursor-pointer">
              <input type="checkbox" checked={usePoints} onChange={e => setUsePoints(e.target.checked)} className="w-4 h-4 mt-0.5" />
              <span className="text-sm text-slate-800">
                Use <span className="font-bold">{maxPoints.toLocaleString()} points</span> (worth {lkr(maxPoints * pointValue)})
                <span className="block text-xs text-slate-600">You have {detail.loyaltyPoints.toLocaleString()} points.</span>
              </span>
            </label>
          )}

          <dl className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm space-y-1.5">
            <div className="flex justify-between"><dt className="text-slate-600">{instalment ? "Instalment" : "Balance due"}</dt><dd className="font-bold tabular-nums">{lkr(target)}</dd></div>
            {points > 0 && <div className="flex justify-between"><dt className="text-slate-600">Loyalty points ({points.toLocaleString()})</dt><dd className="font-bold tabular-nums text-emerald-700">− {lkr(pointsWorth)}</dd></div>}
            <div className="flex justify-between border-t border-slate-200 pt-1.5"><dt className="font-bold text-slate-900">To pay now</dt><dd className="font-black tabular-nums text-slate-900">{lkr(toCharge)}</dd></div>
          </dl>

          {error && <p role="alert" className="text-sm font-bold text-red-600">{error}</p>}

          <button type="submit" disabled={busy || !detail} className="w-full py-3.5 rounded-xl font-black text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Opening secure checkout..." : toCharge > 0 ? "Continue to secure payment" : "Pay with points"}
          </button>
          <button type="button" onClick={onClose} className="w-full py-2 text-sm font-bold text-slate-600 hover:text-slate-900">Cancel</button>

          {toCharge > 0 && (
            <p className="text-[11px] text-slate-500 leading-relaxed">
              You&apos;ll be taken to the payment gateway to pay by card, online banking or mobile wallet. Points are only used once the payment goes through.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
