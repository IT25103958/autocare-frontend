"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import api from "../../../utils/axiosInstance";

interface Funds {
  openingBalance: number;
  asOfDate: string | null;
  openingSetBy: string | null;
  serviceCenter: number;
  retailPos: number;
  fuelSales: number;
  supplierRefunds: number;
  moneyIn: number;
  expenses: number;
  supplierPayments: number;
  payroll: number;
  moneyOut: number;
  available: number;
}

const lkr = (n: number) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(n || 0);
const today = () => new Date().toLocaleDateString("en-CA");

// Available company funds for the finance hero: opening balance + money in −
// money out (expenses, supplier payments, payroll). Worked out by the backend
// from the same ledger as the Financial Summary report.
export default function FundsPosition({ refreshKey = 0, canEdit = true }: { refreshKey?: number; canEdit?: boolean }) {
  const [funds, setFunds] = useState<Funds | null>(null);
  const [failed, setFailed] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ openingBalance: "", asOfDate: today(), note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // document.body in the browser; null while rendering on the server.
  const portal = useSyncExternalStore(() => () => {}, () => document.body, () => null);

  useEffect(() => {
    api.get<Funds>("/finance/funds")
      .then((res) => { setFunds(res.data); setFailed(false); })
      .catch(() => setFailed(true));
  }, [refreshKey]);

  const openEditor = () => {
    setForm({
      openingBalance: funds && funds.asOfDate ? String(funds.openingBalance) : "",
      asOfDate: funds?.asOfDate ?? today(),
      note: "",
    });
    setError("");
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.openingBalance);
    if (form.openingBalance.trim() === "" || !Number.isFinite(amount)) {
      setError("Enter the opening balance.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<Funds>("/finance/funds/opening", { openingBalance: amount, asOfDate: form.asOfDate, note: form.note });
      setFunds(res.data);
      setEditing(false);
    } catch (err) {
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      setError(typeof data === "string" && data ? data : "Couldn't save the opening balance.");
    } finally {
      setSaving(false);
    }
  };

  if (failed) return <p className="text-sm font-bold text-red-300">Couldn&apos;t load available funds.</p>;
  if (!funds) return <div className="h-20 w-64 rounded-2xl bg-white/10 animate-pulse" />;

  const rows: [string, number, "in" | "out"][] = [
    ["Service center", funds.serviceCenter, "in"],
    ["Retail POS", funds.retailPos, "in"],
    ["Fuel sales", funds.fuelSales, "in"],
    ["Supplier refunds", funds.supplierRefunds, "in"],
    ["Expenses", funds.expenses, "out"],
    ["Supplier payments", funds.supplierPayments, "out"],
    ["Payroll", funds.payroll, "out"],
  ];

  return (
    <div className="text-right">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-1">Available Funds</p>
      <p className={`text-4xl lg:text-5xl font-black drop-shadow-md ${funds.available < 0 ? "text-red-400" : "text-white"}`}>{lkr(funds.available)}</p>
      <p className="text-[11px] font-semibold text-slate-400 mt-2">
        {funds.asOfDate ? `${lkr(funds.openingBalance)} on ${funds.asOfDate}` : "No opening balance"} + {lkr(funds.moneyIn)} in &minus; {lkr(funds.moneyOut)} out
      </p>
      <div className="flex justify-end gap-3 mt-2">
        <button onClick={() => setShowDetail((v) => !v)} className="text-[11px] font-black uppercase tracking-widest text-blue-300 hover:text-white">
          {showDetail ? "Hide breakdown" : "Breakdown"}
        </button>
        {canEdit && (
          <button onClick={openEditor} className="text-[11px] font-black uppercase tracking-widest text-blue-300 hover:text-white">
            {funds.asOfDate ? "Reset opening balance" : "Set opening balance"}
          </button>
        )}
      </div>
      {!funds.asOfDate && (
        <p className="text-[11px] font-bold text-amber-300 mt-1">Enter what was in the bank and the drawer to start from, or this only shows the net of recorded activity.</p>
      )}
      {showDetail && (
        <dl className="mt-3 inline-grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-xs text-left bg-white/5 rounded-xl p-3">
          {rows.map(([label, value, dir]) => (
            <div key={label} className="contents">
              <dt className="text-slate-400 font-semibold">{label}</dt>
              <dd className={`text-right font-black ${dir === "in" ? "text-emerald-300" : "text-red-300"}`}>{dir === "in" ? "+" : "−"} {lkr(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {portal && editing && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center-safe justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="opening-title"
          onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}>
          <form onSubmit={save} className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 text-left">
            <h3 id="opening-title" className="text-lg font-black text-slate-900 mb-1.5">Opening balance</h3>
            <p className="text-sm text-slate-500 font-medium mb-5">
              Cash on hand plus every bank account at the start of the date below. Payments, sales, expenses, supplier payments and payroll from that date on are added or taken off automatically.
            </p>
            <label htmlFor="openingBalance" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Amount (LKR)</label>
            <input id="openingBalance" type="number" step="0.01" required autoFocus value={form.openingBalance}
              onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-bold outline-none focus:border-blue-500 mb-4" />
            <label htmlFor="openingAsOf" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">At the start of</label>
            <input id="openingAsOf" type="date" required max={today()} value={form.asOfDate}
              onChange={(e) => setForm({ ...form, asOfDate: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-bold outline-none focus:border-blue-500 mb-1" />
            <p className="text-[11px] font-bold text-amber-700 mb-4">
              Only records on or after this date are counted. Anything earlier is treated as already inside the amount above,
              so to keep all past records, pick a date on or before your first sale.
            </p>
            <label htmlFor="openingNote" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Note (optional)</label>
            <input id="openingNote" type="text" maxLength={200} placeholder="e.g. Bank statement + drawer count" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium outline-none focus:border-blue-500 mb-4" />
            {error && <p className="text-xs font-bold text-red-600 mb-3">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-blue-600 text-white font-bold text-sm disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
            </div>
          </form>
        </div>,
        portal
      )}
    </div>
  );
}
