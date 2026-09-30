"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { Booking, ServicePackage, errorText, inputClass, rupees } from "./booking";

const nowLocal = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

// Walk-in or phone booking opened by staff. Created as a request; the manager
// then confirms it by assigning a rostered technician and bay.
export default function NewJobDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (booking: Booking) => void;
}) {
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [form, setForm] = useState({ vehicleRegNo: "", packageId: "", preferredDate: nowLocal(), customerNotes: "", managerNotes: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<ServicePackage[]>("/service-packages").then(res => {
      setPackages(res.data);
      if (res.data.length) setForm(f => ({ ...f, packageId: String(res.data[0].packageId) }));
    }).catch(() => setError("Couldn't load service packages."));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api.post<Booking>("/bookings", { ...form, packageId: Number(form.packageId) });
      onCreated(res.data);
    } catch (err) {
      setError(errorText(err, "Couldn't create the job."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="newjob-title">
      <form onSubmit={save} className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-lg w-full border border-slate-200 space-y-4">
        <h3 id="newjob-title" className="text-xl font-black text-slate-900">New Walk-in Job</h3>
        <div>
          <label htmlFor="nj-vehicle" className="block text-xs font-bold text-slate-700 mb-1">Vehicle registration</label>
          <input id="nj-vehicle" required value={form.vehicleRegNo} placeholder="WP-CBA-1234"
            onChange={e => setForm({ ...form, vehicleRegNo: e.target.value.toUpperCase() })} className={`${inputClass} font-mono uppercase`} />
          <p className="text-xs text-slate-500 mt-1">If this vehicle belongs to a registered customer, the job appears in their garage.</p>
        </div>
        <div>
          <label htmlFor="nj-package" className="block text-xs font-bold text-slate-700 mb-1">Service package</label>
          <select id="nj-package" value={form.packageId} onChange={e => setForm({ ...form, packageId: e.target.value })} className={inputClass}>
            {packages.map(p => <option key={p.packageId} value={p.packageId}>{p.name} — {rupees(p.price)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="nj-when" className="block text-xs font-bold text-slate-700 mb-1">Start time</label>
          <input id="nj-when" type="datetime-local" value={form.preferredDate} onChange={e => setForm({ ...form, preferredDate: e.target.value })} className={inputClass} required />
        </div>
        <div>
          <label htmlFor="nj-cust" className="block text-xs font-bold text-slate-700 mb-1">Customer's description <span className="font-medium text-slate-500">(optional)</span></label>
          <input id="nj-cust" value={form.customerNotes} maxLength={500} onChange={e => setForm({ ...form, customerNotes: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="nj-mgr" className="block text-xs font-bold text-slate-700 mb-1">Instructions for the technician <span className="font-medium text-slate-500">(optional)</span></label>
          <textarea id="nj-mgr" value={form.managerNotes} maxLength={1000} onChange={e => setForm({ ...form, managerNotes: e.target.value })} className={`${inputClass} h-20 resize-none`} />
        </div>
        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving || !form.packageId} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Creating..." : "Create & Assign"}
          </button>
        </div>
      </form>
    </div>
  );
}
