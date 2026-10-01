"use client";

import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";
import { useAuth } from "../context/AuthContext";
import { errText, fmtDay, fmtWhen, inputClass, lkr } from "../billing/_components/billing";

interface WarrantyClaim {
  claimId: number;
  claimNumber: string;
  invoiceNumber: string;
  customerName: string | null;
  partCode: string;
  partName: string;
  quantity: number;
  purchaseDate: string;
  warrantyMonths: number;
  expiresOn: string;
  defect: string;
  resolution: "REPLACEMENT" | "REFUND";
  refundAmount: number | null;
  refundExpenseNumber: string | null;
  rmaId: number | null;
  supplierName: string | null;
  handledBy: string;
  createdAt: string;
}

interface WarrantyCheck {
  valid: boolean;
  reason: string;
  invoiceNumber: string;
  invoiceStatus: string;
  customerName: string | null;
  vehicleRegNo: string | null;
  partCode: string;
  partName: string;
  onInvoice: boolean;
  quantityPurchased: number;
  unitPricePaid: number;
  warrantyMonths: number;
  purchaseDate: string;
  expiresOn: string;
  daysLeft: number;
  quantityClaimed: number;
  quantityClaimable: number;
  stockAvailable: number;
  claims: WarrantyClaim[];
}

interface Part { partID: number; partCode: string; name: string }
interface SupplierOption { id: number; supplierCode: string; companyName: string }

const HANDLERS = ["ACCOUNTS_FINANCE_OFFICER", "INVENTORY_MANAGER", "SUPER_ADMIN"];
const rmaRef = (id: number | null) => (id == null ? "—" : `RMA-${String(id).padStart(4, "0")}`);

// Customer warranty claims: verify the warranty against the original invoice,
// settle it with a replacement or a refund, and raise the supplier return.
export default function WarrantyPage() {
  const { user } = useAuth();
  const canHandle = HANDLERS.includes(user?.role || "");
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [reload, setReload] = useState(0);

  const [invoice, setInvoice] = useState("");
  const [partCode, setPartCode] = useState("");
  const [check, setCheck] = useState<WarrantyCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");

  const [form, setForm] = useState({ quantity: "1", defect: "", resolution: "REPLACEMENT", supplierId: "", refundAmount: "", refundMethod: "CASH", refundReference: "" });
  const [saving, setSaving] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!user) return;
    api.get<WarrantyClaim[]>("/warranty/claims").then(res => setClaims(res.data)).catch(() => setClaims([]));
  }, [user, reload]);

  useEffect(() => {
    if (!user) return;
    api.get<Part[]>("/parts").then(res => setParts(res.data)).catch(() => setParts([]));
    api.get<SupplierOption[]>("/suppliers/options", { params: { category: "SPARE_PARTS" } }).then(res => setSuppliers(res.data)).catch(() => setSuppliers([]));
  }, [user]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setCheckError("");
    setClaimError("");
    setNotice("");
    try {
      const res = await api.get<WarrantyCheck>("/warranty/check", { params: { invoice: invoice.trim(), partCode: partCode.trim() } });
      setCheck(res.data);
      setForm(f => ({ ...f, quantity: "1", defect: "", refundAmount: String(res.data.unitPricePaid ?? "") }));
    } catch (err) {
      setCheck(null);
      setCheckError(errText(err, "Couldn't check that warranty."));
    } finally {
      setChecking(false);
    }
  };

  const qty = Math.floor(Number(form.quantity) || 0);
  const maxRefund = check ? Math.round(check.unitPricePaid * qty * 100) / 100 : 0;
  const refund = form.resolution === "REFUND";
  const claimInvalid = saving || !check?.valid || qty < 1 || qty > (check?.quantityClaimable ?? 0) || form.defect.trim().length < 10 || !form.supplierId
    || (refund && (!(Number(form.refundAmount) > 0) || Number(form.refundAmount) > maxRefund || (form.refundMethod === "BANK_TRANSFER" && form.refundReference.trim().length < 4)))
    || (!refund && qty > (check?.stockAvailable ?? 0));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!check) return;
    setSaving(true);
    setClaimError("");
    try {
      const res = await api.post<WarrantyClaim>("/warranty/claims", {
        invoiceNumber: check.invoiceNumber, partCode: check.partCode, quantity: qty, defect: form.defect.trim(), resolution: form.resolution,
        supplierId: Number(form.supplierId),
        refundAmount: refund ? Number(form.refundAmount) : null,
        refundMethod: refund ? form.refundMethod : null,
        refundReference: refund && form.refundReference ? form.refundReference : null,
      });
      const c = res.data;
      setNotice(`${c.claimNumber} recorded — ${c.resolution === "REFUND" ? `${lkr(c.refundAmount)} refunded (${c.refundExpenseNumber})` : `${c.quantity} replacement unit(s) issued from stock`}. Supplier return ${rmaRef(c.rmaId)} raised with ${c.supplierName}.`);
      setCheck(null);
      setInvoice("");
      setPartCode("");
      setReload(v => v + 1);
    } catch (err) {
      setClaimError(errText(err, "Couldn't record the claim."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Warranty Claims</h1>
          <p className="text-slate-500 font-medium mt-1">Check a part&apos;s warranty against the customer&apos;s invoice, then replace or refund it. The faulty unit is sent back to the supplier as a return.</p>
        </div>

        {notice && <div role="status" className="px-4 py-3 rounded-xl text-sm font-bold border bg-green-50 text-green-800 border-green-200">{notice}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <form onSubmit={verify} className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4 self-start">
            <h2 className="font-black text-slate-900">1. Verify the warranty</h2>
            <div>
              <label htmlFor="wc-invoice" className="block text-xs font-bold text-slate-700 mb-1">Invoice number</label>
              <input id="wc-invoice" value={invoice} onChange={e => setInvoice(e.target.value.toUpperCase())} placeholder="INV-2026-00042" className={`${inputClass} font-mono`} />
              <p className="text-xs text-slate-500 mt-1">Printed at the top of the customer&apos;s receipt.</p>
            </div>
            <div>
              <label htmlFor="wc-part" className="block text-xs font-bold text-slate-700 mb-1">Part code</label>
              <input id="wc-part" list="wc-parts" value={partCode} onChange={e => setPartCode(e.target.value)} placeholder="Start typing a code or name" className={`${inputClass} font-mono`} />
              <datalist id="wc-parts">
                {parts.map(p => <option key={p.partID} value={p.partCode}>{p.name}</option>)}
              </datalist>
            </div>
            {checkError && <p role="alert" className="text-sm font-bold text-red-600">{checkError}</p>}
            <button type="submit" disabled={checking || invoice.trim().length < 5 || !partCode.trim()} className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
              {checking ? "Checking..." : "Check warranty"}
            </button>
          </form>

          <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            {!check ? (
              <p className="text-sm text-slate-500 py-10 text-center">Enter an invoice number and a part code to see whether the part is still under warranty.</p>
            ) : (
              <div className="space-y-5">
                <div className={`rounded-2xl border p-4 ${check.valid ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/60"}`}>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${check.valid ? "text-emerald-700" : "text-red-700"}`}>{check.valid ? "Under warranty" : "Not covered"}</p>
                  <p className="mt-1 font-black text-slate-900">{check.partName} <span className="font-mono text-xs font-bold text-slate-500">{check.partCode}</span></p>
                  <p className="text-sm text-slate-700 mt-1">{check.reason}</p>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  {[
                    ["Invoice", check.invoiceNumber],
                    ["Customer", check.customerName || "Walk-in customer"],
                    ["Bought on", fmtDay(check.purchaseDate)],
                    ["Warranty", check.warrantyMonths > 0 ? `${check.warrantyMonths} months` : "None"],
                    ["Expires", check.warrantyMonths > 0 ? fmtDay(check.expiresOn) : "—"],
                    ["Days left", check.warrantyMonths > 0 ? String(Math.max(0, check.daysLeft)) : "—"],
                    ["Units on bill", String(check.quantityPurchased)],
                    ["Already claimed", String(check.quantityClaimed)],
                  ].map(([label, value]) => (
                    <div key={label}><dt className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</dt><dd className="font-bold text-slate-900 mt-0.5 break-words">{value}</dd></div>
                  ))}
                </dl>

                {check.valid && canHandle && (
                  <form onSubmit={submit} className="space-y-4 border-t border-slate-100 pt-5">
                    <h2 className="font-black text-slate-900">2. Settle the claim</h2>
                    <fieldset>
                      <legend className="block text-xs font-bold text-slate-700 mb-2">Resolution</legend>
                      <div className="grid grid-cols-2 gap-2" role="radiogroup">
                        {([["REPLACEMENT", "Replace from stock", `${check.stockAvailable} in stock`], ["REFUND", "Refund the customer", `up to ${lkr(check.unitPricePaid)} each`]] as const).map(([key, label, hint]) => (
                          <button key={key} type="button" role="radio" aria-checked={form.resolution === key} onClick={() => setForm({ ...form, resolution: key })}
                            className={`p-3 rounded-xl text-left border-2 ${form.resolution === key ? "border-blue-600 bg-blue-50/60" : "border-slate-100 hover:border-slate-300"}`}>
                            <span className="block text-sm font-bold text-slate-900">{label}</span>
                            <span className="block text-xs text-slate-500">{hint}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="wc-qty" className="block text-xs font-bold text-slate-700 mb-1">Units claimed (max {check.quantityClaimable})</label>
                        <input id="wc-qty" type="number" min={1} max={check.quantityClaimable} value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className={`${inputClass} tabular-nums font-bold`} />
                      </div>
                      <div>
                        <label htmlFor="wc-supplier" className="block text-xs font-bold text-slate-700 mb-1">Return the faulty unit to</label>
                        <select id="wc-supplier" value={form.supplierId} onChange={e => setForm({ ...form, supplierId: e.target.value })} className={inputClass}>
                          <option value="">Choose supplier…</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.companyName}</option>)}
                        </select>
                      </div>
                    </div>
                    {refund && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="wc-amount" className="block text-xs font-bold text-slate-700 mb-1">Refund amount (max {lkr(maxRefund)})</label>
                          <input id="wc-amount" type="number" min={0} step="0.01" value={form.refundAmount} onChange={e => setForm({ ...form, refundAmount: e.target.value })} className={`${inputClass} tabular-nums font-bold`} />
                        </div>
                        <div>
                          <label htmlFor="wc-method" className="block text-xs font-bold text-slate-700 mb-1">Refunded by</label>
                          <select id="wc-method" value={form.refundMethod} onChange={e => setForm({ ...form, refundMethod: e.target.value })} className={inputClass}>
                            <option value="CASH">Cash from the drawer</option>
                            <option value="CARD">Card reversal</option>
                            <option value="BANK_TRANSFER">Bank transfer</option>
                          </select>
                        </div>
                        {form.refundMethod === "BANK_TRANSFER" && (
                          <div className="col-span-2">
                            <label htmlFor="wc-ref" className="block text-xs font-bold text-slate-700 mb-1">Transfer reference</label>
                            <input id="wc-ref" value={form.refundReference} maxLength={60} onChange={e => setForm({ ...form, refundReference: e.target.value })} className={inputClass} />
                          </div>
                        )}
                        <p className="col-span-2 text-xs text-slate-500">The refund is logged as a &quot;Customer refund&quot; expense, so it appears in the books and the day close.</p>
                      </div>
                    )}
                    <div>
                      <label htmlFor="wc-defect" className="block text-xs font-bold text-slate-700 mb-1">What is wrong with the part?</label>
                      <textarea id="wc-defect" rows={3} maxLength={500} value={form.defect} onChange={e => setForm({ ...form, defect: e.target.value })} placeholder="e.g. Pads delaminated after 2,000 km; backing plate cracked." className={inputClass} />
                    </div>
                    {!refund && qty > check.stockAvailable && <p className="text-sm font-bold text-red-600">Not enough stock to replace {qty} unit(s) — offer a refund instead.</p>}
                    {claimError && <p role="alert" className="text-sm font-bold text-red-600">{claimError}</p>}
                    <div className="flex justify-end">
                      <button type="submit" disabled={claimInvalid} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                        {saving ? "Recording..." : refund ? `Refund ${lkr(Number(form.refundAmount) || 0)}` : `Issue ${qty || 0} replacement${qty === 1 ? "" : "s"}`}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="font-black text-slate-900 px-6 pt-5 pb-3">Claim history</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-y border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3">Claim</th>
                  <th className="text-left px-5 py-3">Part</th>
                  <th className="text-left px-5 py-3">Customer / invoice</th>
                  <th className="text-left px-5 py-3">Resolution</th>
                  <th className="text-left px-5 py-3">Supplier return</th>
                </tr>
              </thead>
              <tbody>
                {claims.map(c => (
                  <tr key={c.claimId} className="border-b border-slate-50 align-top">
                    <td className="px-5 py-3"><p className="font-mono text-xs font-bold text-slate-900">{c.claimNumber}</p><p className="text-xs text-slate-500">{fmtWhen(c.createdAt)} · {c.handledBy}</p></td>
                    <td className="px-5 py-3 max-w-[260px]"><p className="font-bold text-slate-900">{c.quantity}× {c.partName}</p><p className="text-xs text-slate-500">{c.defect}</p></td>
                    <td className="px-5 py-3"><p className="text-slate-800">{c.customerName || "Walk-in customer"}</p><p className="font-mono text-xs text-blue-700">{c.invoiceNumber}</p></td>
                    <td className="px-5 py-3">
                      {c.resolution === "REFUND"
                        ? <><p className="font-bold text-slate-900">Refunded {lkr(c.refundAmount)}</p><p className="font-mono text-xs text-slate-500">{c.refundExpenseNumber}</p></>
                        : <p className="font-bold text-slate-900">Replaced from stock</p>}
                    </td>
                    <td className="px-5 py-3"><p className="font-mono text-xs font-bold text-slate-900">{rmaRef(c.rmaId)}</p><p className="text-xs text-slate-500">{c.supplierName}</p></td>
                  </tr>
                ))}
                {claims.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">No warranty claims yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
