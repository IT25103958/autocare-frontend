"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { Notice, ServicePackage, errorText, fmtDuration, inputClass, rupees } from "./booking";

const EMPTY = { name: "", description: "", price: "", durationMinutes: "60" };

// Service package catalogue: create, edit, retire/restore (proposal: admin manages packages & pricing).
export default function PackageManager() {
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get<ServicePackage[]>("/service-packages/all").then(res => setPackages(res.data))
    .catch(err => setNotice({ type: "error", text: errorText(err, "Couldn't load packages.") }));

  useEffect(() => { load(); }, []);

  const startEdit = (p?: ServicePackage) => {
    setForm(p ? { name: p.name, description: p.description || "", price: String(p.price), durationMinutes: String(p.durationMinutes) } : EMPTY);
    setEditing(p ? p.packageId : null);
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { name: form.name, description: form.description, price: Number(form.price), durationMinutes: Number(form.durationMinutes) };
    try {
      if (editing) await api.put(`/service-packages/${editing}`, payload);
      else await api.post("/service-packages", payload);
      setNotice({ type: "ok", text: editing ? "Package updated. Existing bookings keep the price they were quoted." : "Package added." });
      setOpen(false);
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't save the package.") });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: ServicePackage) => {
    try {
      await api.put(`/service-packages/${p.packageId}/active`, null, { params: { value: !p.active } });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't update the package.") });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Packages customers can book online. Retired packages stay on old bookings.</p>
        <button onClick={() => startEdit()} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800">+ New Package</button>
      </div>
      <Notice notice={notice} />

      {open && (
        <form onSubmit={save} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="pk-name" className="block text-xs font-bold text-slate-700 mb-1">Name</label>
            <input id="pk-name" required value={form.name} maxLength={100} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="pk-desc" className="block text-xs font-bold text-slate-700 mb-1">Description</label>
            <input id="pk-desc" value={form.description} maxLength={500} onChange={e => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="pk-price" className="block text-xs font-bold text-slate-700 mb-1">Price (Rs., labour)</label>
            <input id="pk-price" type="number" min={1} step="0.01" required value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="pk-dur" className="block text-xs font-bold text-slate-700 mb-1">Bay time</label>
            <select id="pk-dur" value={form.durationMinutes} onChange={e => setForm({ ...form, durationMinutes: e.target.value })} className={inputClass}>
              {[30, 45, 60, 90, 120, 180, 240, 300, 360, 480].map(m => <option key={m} value={m}>{fmtDuration(m)}</option>)}
            </select>
          </div>
          <div className="md:col-span-2 flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">{saving ? "Saving..." : editing ? "Save Changes" : "Add Package"}</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3">Package</th>
                <th className="text-right px-5 py-3">Price</th>
                <th className="text-right px-5 py-3">Bay time</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-right px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {packages.map(p => (
                <tr key={p.packageId} className={`border-b border-slate-50 ${p.active ? "" : "opacity-60"}`}>
                  <td className="px-5 py-3">
                    <p className="font-bold text-slate-900">{p.name}</p>
                    {p.description && <p className="text-xs text-slate-500">{p.description}</p>}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold">{rupees(p.price)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{fmtDuration(p.durationMinutes)}</td>
                  <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${p.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>{p.active ? "Active" : "Retired"}</span></td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(p)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100">Edit</button>
                    <button onClick={() => toggle(p)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${p.active ? "text-red-700 hover:bg-red-50" : "text-emerald-700 hover:bg-emerald-50"}`}>{p.active ? "Retire" : "Restore"}</button>
                  </td>
                </tr>
              ))}
              {packages.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-500">No packages yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
