"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "../../utils/axiosInstance";
import { highlightFocusTarget } from "../../utils/focusTarget";
import { useAuth } from "../context/AuthContext";
import CollectPaymentDialog from "./_components/CollectPaymentDialog";
import DayCloseCard from "./_components/DayCloseCard";
import InvoiceCustomer from "./_components/InvoiceCustomer";
import ReceivablesPanel from "./_components/ReceivablesPanel";
import {
  Invoice, InvoiceStatusBadge, METHOD_LABEL, Payment, downloadReceipt, errText, fmtWhen, isoDate, lkr, paymentText,
} from "./_components/billing";

interface DaySummary {
  date: string;
  paymentCount: number;
  byMethod: Record<string, number>;
  totalCollected: number;
  outstandingBalance: number;
  payments: { payment: Payment; invoiceNumber: string; customerName: string }[];
}

type Tab = "outstanding" | "receivables" | "today" | "all";
const TABS: Tab[] = ["outstanding", "receivables", "today", "all"];
const COLLECTORS = ["ACCOUNTS_FINANCE_OFFICER", "SUPER_ADMIN"];

// Finance billing desk: bills awaiting payment, receivables by age with repayment
// plans, the day's takings with the day-close reconciliation, and every invoice.
// useSearchParams needs a Suspense boundary, or the production build fails for this route.
export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingDesk />
    </Suspense>
  );
}

function BillingDesk() {
  const { user } = useAuth();
  // A risk alert's Review link can open a given tab and day (?tab=today&date=2026-10-02).
  const params = useSearchParams();
  const canCollect = COLLECTORS.includes(user?.role || "");
  const [tab, setTab] = useState<Tab>(() => TABS.find(t => t === params.get("tab")) ?? "outstanding");
  const [outstanding, setOutstanding] = useState<Invoice[]>([]);
  const [all, setAll] = useState<Invoice[]>([]);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [dayDate, setDayDate] = useState(() => {
    const d = params.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : isoDate(new Date());
  });
  // Bumped after a payment so the receivables and day-close panels refetch too.
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [collecting, setCollecting] = useState<Invoice | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // A failed load must not look like "no bills to collect".
  const loadFailed = (err: unknown) => setNotice({ type: "error", text: errText(err, "Some billing data couldn't be loaded. Refresh before relying on these figures.") });
  const load = () => {
    api.get<Invoice[]>("/invoices/outstanding").then(res => setOutstanding(res.data)).catch(err => { setOutstanding([]); loadFailed(err); });
    api.get<Invoice[]>("/invoices").then(res => setAll(res.data)).catch(err => { setAll([]); loadFailed(err); });
    api.get<DaySummary>("/invoices/day-summary", { params: { date: dayDate } }).then(res => setDay(res.data)).catch(err => { setDay(null); loadFailed(err); });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the user or the chosen day changes
  useEffect(() => { if (user) load(); }, [user, dayDate]);
  // ...and scroll to the row it named (?focus=...) and highlight it.
  useEffect(() => highlightFocusTarget(), []);

  const receipt = async (inv: Invoice) => {
    try {
      await downloadReceipt(inv.invoiceId, inv.invoiceNumber);
    } catch (err) {
      setNotice({ type: "error", text: errText(err, "Couldn't download the receipt.") });
    }
  };

  const filter = (list: Invoice[]) => {
    const q = search.trim().toLowerCase();
    return !q ? list : list.filter(i => [i.invoiceNumber, i.customerName, i.vehicleRegNo, i.description].some(v => v?.toLowerCase().includes(q)));
  };

  const totalOutstanding = useMemo(() => outstanding.reduce((s, i) => s + i.balanceDue, 0), [outstanding]);
  const rows = filter(tab === "outstanding" ? outstanding : all);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Billing & Receipts</h1>
          <p className="text-slate-500 font-medium mt-1">Customer invoices from workshop jobs and counter sales. Receipts are emailed automatically when a bill is paid in full.</p>
        </div>

        {notice && (
          <div role="status" className={`px-4 py-3 rounded-xl text-sm font-bold border ${notice.type === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>{notice.text}</div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ["Awaiting payment", String(outstanding.length), `${lkr(totalOutstanding)} outstanding`],
            ["Collected today", lkr(day?.totalCollected), `${day?.paymentCount ?? 0} payments`],
            ["Cash today", lkr(day?.byMethod?.CASH), "Should be in the drawer"],
            ["Card & online today", lkr((day?.byMethod?.CARD ?? 0) + (day?.byMethod?.ONLINE ?? 0) + (day?.byMethod?.BANK_TRANSFER ?? 0)), "Settled by the bank"],
          ].map(([label, value, sub]) => (
            <div key={label} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{label}</h3>
              <div className="text-2xl font-black text-slate-900 tabular-nums">{value}</div>
              <p className="text-xs font-bold text-slate-500 mt-1">{sub}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200">
          <div className="flex gap-1" role="tablist">
            {([["outstanding", `Awaiting Payment (${outstanding.length})`], ["receivables", "Receivables"], ["today", "Takings & Day Close"], ["all", "All Invoices"]] as [Tab, string][]).map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px ${tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                {label}
              </button>
            ))}
          </div>
          {tab !== "today" ? (
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice, customer, vehicle..." aria-label="Search invoices"
              className="mb-2 px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500 w-full sm:w-72" />
          ) : (
            <input type="date" value={dayDate} onChange={e => setDayDate(e.target.value)} aria-label="Takings date"
              className="mb-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500" />
          )}
        </div>

        {tab === "receivables" ? (
          <ReceivablesPanel canManage={canCollect} refreshKey={refreshKey} search={search}
            onCollect={setCollecting} onNotice={text => setNotice({ type: "ok", text })} />
        ) : tab === "today" ? (
          <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-black text-slate-900 mb-3">By method</h3>
              {!day || Object.keys(day.byMethod).length === 0 ? <p className="text-sm text-slate-500">No payments on this day.</p> : (
                <ul className="space-y-2">
                  {Object.entries(day.byMethod).map(([m, amt]) => (
                    <li key={m} className="flex justify-between text-sm"><span className="text-slate-700">{METHOD_LABEL[m] || m}</span><span className="font-black tabular-nums">{lkr(amt)}</span></li>
                  ))}
                  <li className="flex justify-between text-sm pt-2 border-t border-slate-100"><span className="font-bold">Money collected</span><span className="font-black tabular-nums">{lkr(day.totalCollected)}</span></li>
                </ul>
              )}
              <p className="text-xs text-slate-500 mt-3">Loyalty points are listed but aren&apos;t money in the drawer.</p>
            </div>
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-5 py-3">Receipt</th>
                      <th className="text-left px-5 py-3">Invoice / customer</th>
                      <th className="text-left px-5 py-3">Method</th>
                      <th className="text-left px-5 py-3">By</th>
                      <th className="text-right px-5 py-3">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day?.payments.map(({ payment: p, invoiceNumber, customerName }) => (
                      <tr key={p.paymentId} data-focus={p.receiptNumber} className="border-b border-slate-50">
                        <td className="px-5 py-2.5"><p className="font-mono text-xs font-bold text-slate-800">{p.receiptNumber}</p><p className="text-xs text-slate-500">{fmtWhen(p.paidAt)}</p></td>
                        <td className="px-5 py-2.5"><p className="font-mono text-xs text-blue-700">{invoiceNumber}</p><p className="text-slate-800">{customerName}</p></td>
                        <td className="px-5 py-2.5 text-slate-700">{paymentText(p)}</td>
                        <td className="px-5 py-2.5 text-slate-500">{p.receivedBy}</td>
                        <td className="px-5 py-2.5 text-right font-black tabular-nums">{lkr(p.amount)}</td>
                      </tr>
                    ))}
                    {(!day || day.payments.length === 0) && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No payments on this day.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <DayCloseCard date={dayDate} canClose={canCollect} refreshKey={refreshKey} onClosed={text => setNotice({ type: "ok", text })} />
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3">Invoice</th>
                    <th className="text-left px-5 py-3">Customer</th>
                    <th className="text-left px-5 py-3">For</th>
                    <th className="text-right px-5 py-3">Total</th>
                    <th className="text-right px-5 py-3">Due</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(inv => (
                    <tr key={inv.invoiceId} className="border-b border-slate-50 align-top">
                      <td className="px-5 py-3"><p className="font-mono text-xs font-bold text-slate-900">{inv.invoiceNumber}</p><p className="text-xs text-slate-500">{fmtWhen(inv.issuedAt)}</p></td>
                      <td className="px-5 py-3">
                        <InvoiceCustomer invoice={inv} canEdit={canCollect}
                          onSaved={text => { setNotice({ type: "ok", text }); load(); setRefreshKey(k => k + 1); }} />
                      </td>
                      <td className="px-5 py-3 text-slate-700 max-w-[240px]">{inv.description}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{lkr(inv.totalAmount)}</td>
                      <td className={`px-5 py-3 text-right tabular-nums font-black ${inv.balanceDue > 0 ? "text-red-700" : "text-slate-400"}`}>{lkr(inv.balanceDue)}</td>
                      <td className="px-5 py-3"><InvoiceStatusBadge status={inv.status} />{inv.paidAt && <p className="text-xs text-slate-500 mt-1">{fmtWhen(inv.paidAt)}</p>}{inv.paidVia && <p className="text-xs font-bold text-slate-600 mt-0.5">{inv.paidVia}</p>}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {canCollect && inv.status !== "PAID" && (
                          <button onClick={() => setCollecting(inv)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700">Collect payment</button>
                        )}
                        <button onClick={() => receipt(inv)} className="ml-1 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-50">{inv.status === "PAID" ? "Receipt PDF" : "Invoice PDF"}</button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">{tab === "outstanding" ? "No bills awaiting payment. 🎉" : "No invoices found."}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {collecting && (
        <CollectPaymentDialog invoice={collecting} onClose={() => setCollecting(null)}
          onPaid={(msg) => { setCollecting(null); setNotice({ type: "ok", text: msg }); setRefreshKey(k => k + 1); load(); }} />
      )}
    </div>
  );
}
