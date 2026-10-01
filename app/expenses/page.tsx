"use client";

import { useEffect, useMemo, useState } from "react";
import api from "../../utils/axiosInstance";
import { useAuth } from "../context/AuthContext";
import { METHOD_LABEL, downloadCsv, errText, fmtDay, inputClass, isoDate, lkr } from "../billing/_components/billing";

interface Expense {
  expenseId: number;
  expenseNumber: string;
  expenseDate: string;
  category: string;
  description: string;
  payee: string | null;
  amount: number;
  paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER";
  reference: string | null;
  recordedBy: string;
  createdAt: string;
  voided: boolean;
  voidReason: string | null;
  voidedBy: string | null;
}

interface ExpenseList {
  from: string;
  to: string;
  count: number;
  total: number;
  byCategory: Record<string, number>;
  byMethod: Record<string, number>;
  expenses: Expense[];
}

const CATEGORY_LABEL: Record<string, string> = {
  UTILITIES: "Utilities",
  RENT: "Rent",
  MAINTENANCE: "Maintenance & repairs",
  SUPPLIES: "Office & cleaning supplies",
  TRANSPORT: "Transport & courier",
  STAFF_WELFARE: "Staff welfare",
  MARKETING: "Marketing",
  BANK_CHARGES: "Bank charges",
  CUSTOMER_REFUND: "Customer refund",
  OTHER: "Other",
};
const METHODS = ["CASH", "CARD", "BANK_TRANSFER"] as const;
const WRITERS = ["ACCOUNTS_FINANCE_OFFICER", "SUPER_ADMIN"];
const EMPTY_FORM = { expenseDate: "", category: "UTILITIES", description: "", payee: "", amount: "", paymentMethod: "CASH", reference: "" };

const firstOfMonth = () => {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
};

// Daily expense log: running costs paid on the spot, by category. Supplier
// bills paid later are handled under Payables. Entries are voided, not deleted.
export default function ExpensesPage() {
  const { user } = useAuth();
  const canWrite = WRITERS.includes(user?.role || "");
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [data, setData] = useState<ExpenseList | null>(null);
  const [category, setCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!user || !from || !to) return;
    api.get<ExpenseList>("/expenses", { params: { from, to } })
      .then(res => setData(res.data))
      .catch(err => { setData(null); setNotice({ type: "error", text: errText(err, "Couldn't load expenses.") }); });
  }, [user, from, to, reload]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.expenses ?? []).filter(e => (showVoided || !e.voided)
      && (category === "ALL" || e.category === category)
      && (!q || [e.expenseNumber, e.description, e.payee, e.reference, e.recordedBy].some(v => v?.toLowerCase().includes(q))));
  }, [data, category, search, showVoided]);

  const categories = Object.entries(data?.byCategory ?? {}).sort((a, b) => b[1] - a[1]);
  const voidedCount = (data?.expenses ?? []).filter(e => e.voided).length;

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, expenseDate: isoDate(new Date()) });
    setDialogError("");
    setAdding(true);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setDialogError("");
    try {
      const res = await api.post<Expense>("/expenses", { ...form, amount: Number(form.amount), payee: form.payee || null, reference: form.reference || null });
      setAdding(false);
      setNotice({ type: "ok", text: `${res.data.expenseNumber} logged — ${lkr(res.data.amount)} for ${res.data.description}.` });
      setReload(v => v + 1);
    } catch (err) {
      setDialogError(errText(err, "Couldn't save the expense."));
    } finally {
      setSaving(false);
    }
  };

  const confirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiding) return;
    setSaving(true);
    setDialogError("");
    try {
      await api.put(`/expenses/${voiding.expenseId}/void`, { reason: voidReason });
      setNotice({ type: "ok", text: `${voiding.expenseNumber} voided.` });
      setVoiding(null);
      setReload(v => v + 1);
    } catch (err) {
      setDialogError(errText(err, "Couldn't void the expense."));
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => downloadCsv("expenses",
    ["Number", "Date", "Category", "Description", "Paid to", "Method", "Reference", "Amount", "Recorded by", "Status", "Void reason"],
    rows.map(e => [e.expenseNumber, e.expenseDate, CATEGORY_LABEL[e.category] || e.category, e.description, e.payee, METHOD_LABEL[e.paymentMethod], e.reference,
      e.amount, e.recordedBy, e.voided ? "VOIDED" : "OK", e.voidReason]));

  const addInvalid = saving || form.description.trim().length < 3 || !(Number(form.amount) > 0) || !form.expenseDate
    || (form.paymentMethod === "BANK_TRANSFER" && form.reference.trim().length < 4);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Expenses</h1>
            <p className="text-slate-500 font-medium mt-1">Day-to-day running costs paid on the spot. Supplier bills to be paid later go under Payables.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCsv} disabled={rows.length === 0} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">Export CSV</button>
            {canWrite && <button onClick={openAdd} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700">Log expense</button>}
          </div>
        </div>

        {notice && (
          <div role="status" className={`px-4 py-3 rounded-xl text-sm font-bold border ${notice.type === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>{notice.text}</div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ["Total spent", lkr(data?.total), `${data?.count ?? 0} expenses in this period`],
            ["Paid in cash", lkr(data?.byMethod?.CASH), "Taken out of the drawer"],
            ["Card & transfer", lkr((data?.byMethod?.CARD ?? 0) + (data?.byMethod?.BANK_TRANSFER ?? 0)), "Paid through the bank"],
            ["Biggest category", categories[0] ? CATEGORY_LABEL[categories[0][0]] || categories[0][0] : "—", categories[0] ? lkr(categories[0][1]) : "Nothing logged yet"],
          ].map(([label, value, sub]) => (
            <div key={label} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{label}</h3>
              <div className="text-2xl font-black text-slate-900 tabular-nums">{value}</div>
              <p className="text-xs font-bold text-slate-500 mt-1">{sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-black text-slate-900 mb-4">By category</h3>
            {categories.length === 0 ? <p className="text-sm text-slate-500">No expenses in this period.</p> : (
              <ul className="space-y-3">
                {categories.map(([key, amount]) => (
                  <li key={key}>
                    <div className="flex justify-between text-sm"><span className="text-slate-700">{CATEGORY_LABEL[key] || key}</span><span className="font-black tabular-nums">{lkr(amount)}</span></div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, (amount / (data?.total || 1)) * 100)}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="ex-from" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">From</label>
                <input id="ex-from" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500" />
              </div>
              <div>
                <label htmlFor="ex-to" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">To</label>
                <input id="ex-to" type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500" />
              </div>
              <div>
                <label htmlFor="ex-cat" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Category</label>
                <select id="ex-cat" value={category} onChange={e => setCategory(e.target.value)} className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500">
                  <option value="ALL">All categories</option>
                  {Object.entries(CATEGORY_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description, payee..." aria-label="Search expenses"
                className="flex-1 min-w-[180px] px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500" />
              {voidedCount > 0 && (
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 pb-2.5 cursor-pointer">
                  <input type="checkbox" checked={showVoided} onChange={e => setShowVoided(e.target.checked)} className="w-4 h-4" /> Show voided ({voidedCount})
                </label>
              )}
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-5 py-3">Expense</th>
                      <th className="text-left px-5 py-3">What for</th>
                      <th className="text-left px-5 py-3">Paid by</th>
                      <th className="text-right px-5 py-3">Amount</th>
                      <th className="text-right px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(e => (
                      <tr key={e.expenseId} className={`border-b border-slate-50 align-top ${e.voided ? "opacity-60" : ""}`}>
                        <td className="px-5 py-3"><p className="font-mono text-xs font-bold text-slate-900">{e.expenseNumber}</p><p className="text-xs text-slate-500">{fmtDay(e.expenseDate)}</p></td>
                        <td className="px-5 py-3 max-w-[280px]">
                          <p className={`font-bold text-slate-900 ${e.voided ? "line-through" : ""}`}>{e.description}</p>
                          <p className="text-xs text-slate-500">{CATEGORY_LABEL[e.category] || e.category}{e.payee ? ` · ${e.payee}` : ""}</p>
                          {e.voided && <p className="text-xs font-bold text-red-700">Voided by {e.voidedBy}: {e.voidReason}</p>}
                        </td>
                        <td className="px-5 py-3"><p className="text-slate-700">{METHOD_LABEL[e.paymentMethod]}{e.reference ? ` · ${e.reference}` : ""}</p><p className="text-xs text-slate-500">by {e.recordedBy}</p></td>
                        <td className={`px-5 py-3 text-right font-black tabular-nums ${e.voided ? "line-through text-slate-400" : "text-slate-900"}`}>{lkr(e.amount)}</td>
                        <td className="px-5 py-3 text-right">
                          {canWrite && !e.voided && (
                            <button onClick={() => { setVoiding(e); setVoidReason(""); setDialogError(""); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 hover:bg-red-50">Void</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">No expenses found for this period.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="ex-add-title">
          <form onSubmit={add} className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-lg w-full border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            <h3 id="ex-add-title" className="text-xl font-black text-slate-900">Log an Expense</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ex-date" className="block text-xs font-bold text-slate-700 mb-1">Date</label>
                <input id="ex-date" type="date" value={form.expenseDate} max={isoDate(new Date())} onChange={e => setForm({ ...form, expenseDate: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label htmlFor="ex-amount" className="block text-xs font-bold text-slate-700 mb-1">Amount (Rs.)</label>
                <input id="ex-amount" type="number" min={0} step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={`${inputClass} tabular-nums font-bold`} />
              </div>
            </div>
            <div>
              <label htmlFor="ex-category" className="block text-xs font-bold text-slate-700 mb-1">Category</label>
              <select id="ex-category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputClass}>
                {Object.entries(CATEGORY_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ex-desc" className="block text-xs font-bold text-slate-700 mb-1">What was it for?</label>
              <input id="ex-desc" value={form.description} maxLength={200} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. Electricity bill — September" className={inputClass} />
            </div>
            <div>
              <label htmlFor="ex-payee" className="block text-xs font-bold text-slate-700 mb-1">Paid to <span className="font-medium text-slate-500">(optional)</span></label>
              <input id="ex-payee" value={form.payee} maxLength={120} onChange={e => setForm({ ...form, payee: e.target.value })} placeholder="e.g. Ceylon Electricity Board" className={inputClass} />
            </div>
            <fieldset>
              <legend className="block text-xs font-bold text-slate-700 mb-2">Paid by</legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup">
                {METHODS.map(m => (
                  <button key={m} type="button" role="radio" aria-checked={form.paymentMethod === m} onClick={() => setForm({ ...form, paymentMethod: m })}
                    className={`py-2.5 rounded-xl text-sm font-bold border-2 ${form.paymentMethod === m ? "border-blue-600 bg-blue-50/60 text-blue-800" : "border-slate-100 text-slate-700 hover:border-slate-300"}`}>
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
              {form.paymentMethod === "CASH" && <p className="text-xs text-slate-500 mt-2">Cash expenses are deducted from the cash expected in the drawer at day close.</p>}
            </fieldset>
            <div>
              <label htmlFor="ex-ref" className="block text-xs font-bold text-slate-700 mb-1">
                {form.paymentMethod === "BANK_TRANSFER" ? "Transfer reference" : <>Bill / voucher no. <span className="font-medium text-slate-500">(optional)</span></>}
              </label>
              <input id="ex-ref" value={form.reference} maxLength={60} onChange={e => setForm({ ...form, reference: e.target.value })} className={inputClass} />
            </div>
            {dialogError && <p role="alert" className="text-sm font-bold text-red-600">{dialogError}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setAdding(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={addInvalid} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving..." : "Log expense"}</button>
            </div>
          </form>
        </div>
      )}

      {voiding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="ex-void-title">
          <form onSubmit={confirmVoid} className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-md w-full border border-slate-200 space-y-4">
            <div>
              <h3 id="ex-void-title" className="text-xl font-black text-slate-900">Void {voiding.expenseNumber}?</h3>
              <p className="text-sm text-slate-500 mt-1">{lkr(voiding.amount)} · {voiding.description}. It stays in the log, marked as voided, and no longer counts in the totals.</p>
            </div>
            <div>
              <label htmlFor="ex-void-reason" className="block text-xs font-bold text-slate-700 mb-1">Reason</label>
              <input id="ex-void-reason" value={voidReason} maxLength={200} onChange={e => setVoidReason(e.target.value)} placeholder="e.g. Entered twice by mistake" className={inputClass} />
            </div>
            {dialogError && <p role="alert" className="text-sm font-bold text-red-600">{dialogError}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setVoiding(null)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={saving || voidReason.trim().length < 5} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">{saving ? "Voiding..." : "Void expense"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
