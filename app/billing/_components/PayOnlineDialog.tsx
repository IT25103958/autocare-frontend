"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { FREQUENCY_LABEL, Invoice, InvoiceDetail, errText, fmtDay, inputClass, lkr } from "./billing";

const formatCard = (v: string) => v.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

// Customer checkout through the simulated card gateway (no real money moves).
// Card details go straight to the server for the charge and are not stored.
export default function PayOnlineDialog({ invoice, onClose, onPaid }: {
  invoice: Invoice;
  onClose: () => void;
  onPaid: (message: string) => void;
}) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [payFull, setPayFull] = useState(false);
  const [card, setCard] = useState({ cardNumber: "", expiry: "", cvc: "", cardholderName: "" });
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);

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
  const cardAmount = Math.max(0, Math.round((target - pointsWorth) * 100) / 100);
  const needsCard = cardAmount > 0;

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaying(true);
    setError("");
    try {
      await api.post(`/invoices/${invoice.invoiceId}/pay-online`, {
        ...(needsCard ? card : { cardNumber: null, expiry: null, cvc: null, cardholderName: null }),
        pointsToRedeem: points || null,
        amount: instalment ? cardAmount : null,
      });
      onPaid(instalment
        ? `Payment successful — ${lkr(target)} paid towards ${invoice.invoiceNumber}. ${lkr(invoice.balanceDue - target)} is still due.`
        : `Payment successful — ${invoice.invoiceNumber} is paid. Your receipt has been emailed to you.`);
    } catch (err) {
      setError(errText(err, "The payment didn't go through. Please try again."));
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="payonline-title">
      <form onSubmit={pay} className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="bg-slate-900 text-white p-6">
          <p className="text-xs font-black uppercase tracking-widest text-slate-300">Secure checkout</p>
          <h3 id="payonline-title" className="text-2xl font-black mt-1">{lkr(target)}</h3>
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

          {needsCard ? (
            <>
              <div>
                <label htmlFor="po-number" className="block text-xs font-bold text-slate-700 mb-1">Card number</label>
                <input id="po-number" inputMode="numeric" autoComplete="cc-number" value={card.cardNumber}
                  onChange={e => setCard({ ...card, cardNumber: formatCard(e.target.value) })} placeholder="4242 4242 4242 4242" className={`${inputClass} font-mono tracking-wider`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="po-exp" className="block text-xs font-bold text-slate-700 mb-1">Expiry</label>
                  <input id="po-exp" inputMode="numeric" autoComplete="cc-exp" value={card.expiry}
                    onChange={e => setCard({ ...card, expiry: formatExpiry(e.target.value) })} placeholder="MM/YY" className={`${inputClass} font-mono`} />
                </div>
                <div>
                  <label htmlFor="po-cvc" className="block text-xs font-bold text-slate-700 mb-1">CVC</label>
                  <input id="po-cvc" inputMode="numeric" autoComplete="cc-csc" value={card.cvc} maxLength={4}
                    onChange={e => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "") })} placeholder="123" className={`${inputClass} font-mono`} />
                </div>
              </div>
              <div>
                <label htmlFor="po-name" className="block text-xs font-bold text-slate-700 mb-1">Name on card</label>
                <input id="po-name" autoComplete="cc-name" value={card.cardholderName} onChange={e => setCard({ ...card, cardholderName: e.target.value })} className={inputClass} />
              </div>
            </>
          ) : (
            <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">Your points cover {instalment ? "this instalment" : "the whole bill"} — no card needed.</p>
          )}

          {error && <p role="alert" className="text-sm font-bold text-red-600">{error}</p>}

          <button type="submit" disabled={paying || (needsCard && (card.cardNumber.length < 15 || card.expiry.length < 5 || card.cvc.length < 3 || card.cardholderName.trim().length < 2))}
            className="w-full py-3.5 rounded-xl font-black text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {paying ? "Processing..." : needsCard ? `Pay ${lkr(cardAmount)}` : "Pay with points"}
          </button>
          <button type="button" onClick={onClose} className="w-full py-2 text-sm font-bold text-slate-600 hover:text-slate-900">Cancel</button>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Demo payment gateway — no real money is charged. Test cards: <span className="font-mono">4242 4242 4242 4242</span> (approved),
            <span className="font-mono"> 4000 0000 0000 0002</span> (declined), <span className="font-mono">4000 0000 0000 9995</span> (insufficient funds).
            Card numbers are never stored; only the last 4 digits appear on your receipt.
          </p>
        </div>
      </form>
    </div>
  );
}
