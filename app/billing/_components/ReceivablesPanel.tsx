"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import InvoiceCustomer from "./InvoiceCustomer";
import RepaymentPlanDialog from "./RepaymentPlanDialog";
import { FREQUENCY_LABEL, Invoice, Receivables, ReceivableRow, downloadCsv, fmtDay, lkr } from "./billing";

const BUCKET_TONE = ["text-slate-900", "text-amber-700", "text-orange-700", "text-red-700"];

// Accounts receivable: what customers owe by age, and the repayment plans
// agreed for bills being paid in instalments.
export default function ReceivablesPanel({ canManage, refreshKey, search, onCollect, onNotice }: {
  canManage: boolean;
  refreshKey: number;
  search: string;
  onCollect: (invoice: Invoice) => void;
  onNotice: (text: string) => void;
}) {
  const [data, setData] = useState<Receivables | null>(null);
  const [planning, setPlanning] = useState<ReceivableRow | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api.get<Receivables>("/invoices/receivables").then(res => setData(res.data)).catch(() => setData(null));
  }, [refreshKey, reload]);

  const q = search.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter(r => !q || [r.invoice.invoiceNumber, r.invoice.customerName, r.invoice.vehicleRegNo, r.invoice.description].some(v => v?.toLowerCase().includes(q)));

  const exportCsv = () => downloadCsv("receivables",
    ["Invoice", "Issued", "Customer", "Vehicle", "For", "Total", "Paid", "Balance due", "Age (days)", "Ageing", "Plan", "Next due", "Overdue"],
    rows.map(({ invoice: i, ageDays, bucket, plan }) => [i.invoiceNumber, i.issuedAt.slice(0, 10), i.customerName, i.vehicleRegNo, i.description, i.totalAmount, i.amountPaid, i.balanceDue,
      ageDays, bucket, plan ? `${plan.installments} ${FREQUENCY_LABEL[plan.frequency]}` : "", plan?.nextDueDate ?? "", plan?.overdueAmount ?? ""]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(data?.buckets ?? []).map((b, i) => (
          <div key={b.label} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{b.label}</h3>
            <div className={`text-2xl font-black tabular-nums ${b.amount > 0 ? BUCKET_TONE[i] : "text-slate-400"}`}>{lkr(b.amount)}</div>
            <p className="text-xs font-bold text-slate-500 mt-1">{b.count} invoice{b.count === 1 ? "" : "s"}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          <span className="font-black text-slate-900">{lkr(data?.totalOutstanding)}</span> owed on {data?.invoiceCount ?? 0} invoices
          {data && data.planCount > 0 && <> · {data.planCount} on a repayment plan ({lkr(data.onPlanAmount)})</>}
          {data && data.overduePlanCount > 0 && <span className="font-bold text-red-700"> · {lkr(data.overdueInstallmentAmount)} in overdue instalments</span>}
        </p>
        <button onClick={exportCsv} disabled={rows.length === 0} className="px-3 py-2 rounded-lg text-xs font-bold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">Export CSV</button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3">Invoice</th>
                <th className="text-left px-5 py-3">Customer</th>
                <th className="text-left px-5 py-3">Age</th>
                <th className="text-right px-5 py-3">Due</th>
                <th className="text-left px-5 py-3">Repayment plan</th>
                <th className="text-right px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const { invoice: inv, plan } = row;
                return (
                  <tr key={inv.invoiceId} data-focus={inv.invoiceNumber} className="border-b border-slate-50 align-top">
                    <td className="px-5 py-3"><p className="font-mono text-xs font-bold text-slate-900">{inv.invoiceNumber}</p><p className="text-xs text-slate-500 max-w-[220px]">{inv.description}</p></td>
                    <td className="px-5 py-3">
                      <InvoiceCustomer invoice={inv} canEdit={canManage} onSaved={text => { onNotice(text); setReload(r => r + 1); }} />
                    </td>
                    <td className="px-5 py-3"><p className={`font-black tabular-nums ${row.ageDays > 60 ? "text-red-700" : row.ageDays > 30 ? "text-orange-700" : "text-slate-900"}`}>{row.ageDays} day{row.ageDays === 1 ? "" : "s"}</p><p className="text-xs text-slate-500">since {fmtDay(inv.issuedAt)}</p></td>
                    <td className="px-5 py-3 text-right"><p className="font-black tabular-nums text-red-700">{lkr(inv.balanceDue)}</p>{inv.amountPaid > 0 && <p className="text-xs text-slate-500 tabular-nums">{lkr(inv.amountPaid)} paid</p>}</td>
                    <td className="px-5 py-3">
                      {plan ? (
                        <>
                          <p className="text-slate-800">{plan.installmentsPaid}/{plan.installments} paid · {lkr(plan.installmentAmount)} {FREQUENCY_LABEL[plan.frequency]}</p>
                          {plan.overdueAmount > 0
                            ? <p className="text-xs font-bold text-red-700">{lkr(plan.overdueAmount)} overdue</p>
                            : <p className="text-xs text-slate-500">Next {lkr(plan.nextDueAmount)} on {fmtDay(plan.nextDueDate)}</p>}
                        </>
                      ) : <span className="text-slate-400">Due in full</span>}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {(canManage || plan) && (
                        <button onClick={() => setPlanning(row)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-50">{plan ? "View plan" : "Set plan"}</button>
                      )}
                      {canManage && <button onClick={() => onCollect(inv)} className="ml-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700">Collect payment</button>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">{data ? "Nothing is owed — every invoice is paid." : "Couldn't load receivables."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {planning && (
        <RepaymentPlanDialog row={planning} canManage={canManage} onClose={() => setPlanning(null)}
          onSaved={msg => { setPlanning(null); onNotice(msg); setReload(v => v + 1); }} />
      )}
    </div>
  );
}
