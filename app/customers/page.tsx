"use client";

import { useState, useEffect, useMemo } from "react";
import api from "../../utils/axiosInstance";
import CustomerHistoryDrawer from "../_components/CustomerHistoryDrawer";
import { CustomerProfile, TierBadge, TIER_ORDER, errorText } from "../_components/crm";

const EMPTY = { name: "", email: "", vehicleRegNo: "", contactNumber: "" };

// CRO customer directory: register walk-in customers, keep profiles up to date,
// and open any customer's full service history.
export default function CustomerDirectory() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [historyFor, setHistoryFor] = useState<number | null>(null);

  const fetchCustomers = async () => {
    try {
      const res = await api.get<CustomerProfile[]>("/customers");
      setCustomers(res.data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setMessage({ type: "error", text: "Failed to load customers." });
    }
  };

  // Started from a callback so the state updates aren't made inside the effect body.
  useEffect(() => { Promise.resolve().then(fetchCustomers); }, []);

  const startCreate = () => { setForm(EMPTY); setEditingId(null); setShowForm(true); setMessage(null); };
  const startEdit = (c: CustomerProfile) => {
    setForm({ name: c.name, email: c.email, vehicleRegNo: c.vehicleRegNo, contactNumber: c.contactNumber });
    setEditingId(c.customerID);
    setShowForm(true);
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId === null) {
        const res = await api.post<CustomerProfile>("/customers", form);
        setMessage({ type: "ok", text: `${res.data.name} (${res.data.vehicleRegNo}) registered.` });
      } else {
        const res = await api.put<CustomerProfile>(`/customers/${editingId}`, form);
        setMessage({ type: "ok", text: `${res.data.name}'s profile updated.` });
      }
      setShowForm(false);
      setForm(EMPTY);
      fetchCustomers();
    } catch (err) {
      setMessage({ type: "error", text: errorText(err, "Couldn't save the customer.") });
    } finally {
      setSaving(false);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .filter(c => tierFilter === "ALL" || c.membershipTier === tierFilter)
      .filter(c => !q || [c.name, c.email, c.vehicleRegNo, c.contactNumber].some(v => v?.toLowerCase().includes(q)));
  }, [customers, search, tierFilter]);

  const inputClass = "w-full px-3 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="p-4 md:p-8 min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Customers</h1>
            <p className="text-slate-500 font-medium mt-1">{customers.length} customer profiles · membership and service history</p>
          </div>
          <button onClick={startCreate} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-black uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700">
            Register Customer
          </button>
        </div>

        {message && (
          <div role="status" className={`mb-4 px-4 py-3 rounded-xl text-sm font-bold border ${message.type === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
            {message.text}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-black text-slate-900 mb-4">{editingId === null ? "Register a Customer" : "Edit Customer"}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="c-name" className="block text-xs font-bold text-slate-700 mb-1">Full name</label>
                <input id="c-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label htmlFor="c-email" className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <input id="c-email" required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label htmlFor="c-vehicle" className="block text-xs font-bold text-slate-700 mb-1">Vehicle registration</label>
                <input id="c-vehicle" required value={form.vehicleRegNo} placeholder="CBA-4321" onChange={e => setForm({ ...form, vehicleRegNo: e.target.value })} className={`${inputClass} font-mono uppercase`} />
              </div>
              <div>
                <label htmlFor="c-phone" className="block text-xs font-bold text-slate-700 mb-1">Contact number</label>
                <input id="c-phone" required type="tel" value={form.contactNumber} placeholder="+94 77 123 4567" onChange={e => setForm({ ...form, contactNumber: e.target.value })} className={inputClass} />
              </div>
            </div>
            {editingId === null && (
              <p className="text-xs text-slate-500 mt-3">If this customer already has a web account with the same email, it is linked automatically.</p>
            )}
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving..." : editingId === null ? "Register" : "Save Changes"}
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-wrap gap-3 mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, vehicle or phone..." aria-label="Search customers"
            className="flex-1 min-w-[220px] md:max-w-md px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
          <select value={tierFilter} onChange={e => setTierFilter(e.target.value)} aria-label="Membership tier filter"
            className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-blue-500">
            <option value="ALL">All tiers</option>
            {TIER_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Vehicle</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Membership</th>
                  <th className="px-5 py-3 text-right">Points</th>
                  <th className="px-5 py-3">Web account</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {visible.map(c => (
                  <tr key={c.customerID} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-500">{c.email}</div>
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-blue-700">{c.vehicleRegNo}</td>
                    <td className="px-5 py-3">{c.contactNumber}</td>
                    <td className="px-5 py-3"><TierBadge tier={c.membershipTier} /></td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold">{c.loyaltyPoints.toLocaleString()}</td>
                    <td className="px-5 py-3 text-xs">{c.username ? <span className="font-bold text-slate-700">{c.username}</span> : <span className="text-slate-500">Not linked</span>}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setHistoryFor(c.customerID)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800">History</button>
                        <button onClick={() => startEdit(c)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50">Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-500">{customers.length === 0 ? "No customers registered yet." : "No customers match your search."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {historyFor !== null && <CustomerHistoryDrawer customerId={historyFor} onClose={() => setHistoryFor(null)} onChanged={fetchCustomers} />}
    </div>
  );
}
