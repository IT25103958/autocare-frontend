"use client";

import { useState } from "react";
import api from "../../../utils/axiosInstance";
import { fullNameProblem, phoneProblem, tidyName, tidyPhone } from "../../../utils/signupRules";
import { Invoice, errText, inputClass } from "./billing";

// What the backend puts on a bill nobody has named yet (InvoiceService.WALK_IN).
const WALK_IN = "Walk-in customer";
const isUnnamed = (inv: Invoice) => !inv.customerUsername && (!inv.customerName || inv.customerName === WALK_IN);

// The "Customer" cell of a billing table: name, phone, vehicle and account tag.
// Walk-in bills can be given a name here; account bills take the account's name.
export default function InvoiceCustomer({ invoice: inv, canEdit, onSaved }: {
  invoice: Invoice;
  canEdit: boolean;
  onSaved: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const unnamed = isUnnamed(inv);

  return (
    <>
      {unnamed ? (
        <p className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-bold text-amber-700">Name not recorded</p>
      ) : (
        <p className="font-bold text-slate-900">{inv.customerName}</p>
      )}
      {inv.customerPhone && <a href={`tel:${inv.customerPhone}`} className="block text-xs text-slate-600 hover:text-blue-700 tabular-nums">{inv.customerPhone}</a>}
      {inv.vehicleRegNo && <p className="text-xs font-mono text-slate-500">{inv.vehicleRegNo}</p>}
      {inv.customerUsername && <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Web account</p>}
      {canEdit && !inv.customerUsername && (
        <button type="button" onClick={() => setEditing(true)}
          className={`mt-1 text-xs font-bold hover:underline ${unnamed ? "text-blue-700" : "text-slate-500"}`}>
          {unnamed ? "+ Add customer name" : "Edit"}
        </button>
      )}
      {editing && (
        <WalkInCustomerDialog invoice={inv} onClose={() => setEditing(false)}
          onSaved={message => { setEditing(false); onSaved(message); }} />
      )}
    </>
  );
}

function WalkInCustomerDialog({ invoice, onClose, onSaved }: {
  invoice: Invoice;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(isUnnamed(invoice) ? "" : invoice.customerName ?? "");
  const [phone, setPhone] = useState(invoice.customerPhone ?? "");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const nameError = touched || name ? fullNameProblem(name) : null;
  const phoneError = phoneProblem(phone);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (fullNameProblem(name) || phoneError) return;
    setSaving(true);
    setError("");
    try {
      await api.put(`/invoices/${invoice.invoiceId}/customer`, { name: tidyName(name), phone: tidyPhone(phone) || null });
      onSaved(`${invoice.invoiceNumber} is now made out to ${tidyName(name)}.`);
    } catch (err) {
      setError(errText(err, "Couldn't save the customer."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="walkin-title">
      <form onSubmit={save} noValidate className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-md w-full border border-slate-200 space-y-4 text-left whitespace-normal">
        <div>
          <h3 id="walkin-title" className="text-xl font-black text-slate-900">Customer on this bill</h3>
          <p className="text-sm text-slate-500 mt-1">{invoice.invoiceNumber}{invoice.vehicleRegNo ? ` · ${invoice.vehicleRegNo}` : ""} · {invoice.description}</p>
        </div>
        <div>
          <label htmlFor="wi-name" className="block text-xs font-bold text-slate-700 mb-1">Customer name</label>
          <input id="wi-name" autoFocus value={name} maxLength={60} placeholder="e.g. Nimal Perera" autoComplete="off"
            onChange={e => setName(e.target.value)} onBlur={() => setTouched(true)}
            className={`${inputClass} ${nameError ? "border-red-400" : ""}`} aria-invalid={!!nameError} />
          {nameError && <p className="text-xs font-bold text-red-600 mt-1">{nameError}</p>}
        </div>
        <div>
          <label htmlFor="wi-phone" className="block text-xs font-bold text-slate-700 mb-1">Phone <span className="font-medium text-slate-500">(optional)</span></label>
          <input id="wi-phone" type="tel" value={phone} maxLength={16} placeholder="0771234567" autoComplete="off"
            onChange={e => setPhone(e.target.value)} className={`${inputClass} tabular-nums ${phoneError ? "border-red-400" : ""}`} aria-invalid={!!phoneError} />
          {phoneError && <p className="text-xs font-bold text-red-600 mt-1">{phoneError}</p>}
        </div>
        <p className="text-xs text-slate-500">The name is printed on the receipt and kept on the job card. The change is recorded in the audit log.</p>
        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
