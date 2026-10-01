"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import PayOnlineDialog from "./PayOnlineDialog";
import { Invoice, InvoiceStatusBadge, downloadReceipt, errText, fmtWhen, lkr } from "./billing";

// Customer billing portal (proposal: view pending bills, apply loyalty points,
// pay online, download PDF receipts).
export default function CustomerBills({ refreshKey = 0, onPaid }: { refreshKey?: number; onPaid?: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [showPaid, setShowPaid] = useState(false);

  const load = () => api.get<Invoice[]>("/invoices/my").then(res => setInvoices(res.data)).catch(() => setInvoices([]));
  useEffect(() => { load(); }, [refreshKey]);

  const unpaid = invoices.filter(i => i.status !== "PAID");
  const paid = invoices.filter(i => i.status === "PAID");
  if (invoices.length === 0) return null;

  const receipt = async (inv: Invoice) => {
    try {
      await downloadReceipt(inv.invoiceId, inv.invoiceNumber);
    } catch (err) {
      setNotice({ type: "error", text: errText(err, "Couldn't download the receipt.") });
    }
  };

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">My Bills</h2>
        {paid.length > 0 && (
          <button onClick={() => setShowPaid(v => !v)} className="text-xs font-bold text-blue-700 hover:underline">{showPaid ? "Hide" : "Show"} paid ({paid.length})</button>
        )}
      </div>
      {notice && (
        <div role="status" className={`mb-3 px-4 py-3 rounded-xl text-sm font-bold border ${notice.type === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>{notice.text}</div>
      )}
      {unpaid.length === 0 && !showPaid && <p className="text-sm text-slate-500">You have no unpaid bills.</p>}
      <ul className="space-y-3">
        {[...unpaid, ...(showPaid ? paid : [])].map(inv => (
          <li key={inv.invoiceId} className={`border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 ${inv.status === "PAID" ? "border-slate-200" : "border-red-200 bg-red-50/30"}`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-500">{inv.invoiceNumber}</span>
                <InvoiceStatusBadge status={inv.status} />
              </div>
              <p className="font-bold text-slate-900 mt-1">{inv.description}</p>
              <p className="text-xs text-slate-500">{inv.status === "PAID" ? `Paid ${fmtWhen(inv.paidAt)}` : `Issued ${fmtWhen(inv.issuedAt)}`}{inv.paidVia ? ` · ${inv.paidVia}` : ""}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black tabular-nums text-slate-900">{lkr(inv.status === "PAID" ? inv.totalAmount : inv.balanceDue)}</p>
              <div className="flex gap-2 justify-end mt-1">
                <button onClick={() => receipt(inv)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-50">{inv.status === "PAID" ? "Receipt" : "Invoice"} PDF</button>
                {inv.status !== "PAID" && (
                  <button onClick={() => setPaying(inv)} className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700">Pay now</button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {paying && (
        <PayOnlineDialog invoice={paying} onClose={() => setPaying(null)}
          onPaid={msg => { setPaying(null); setNotice({ type: "ok", text: msg }); load(); onPaid?.(); }} />
      )}
    </div>
  );
}
