"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../utils/axiosInstance";
import { useAuth } from "../context/AuthContext";
import { errText, inputClass } from "../billing/_components/billing";
import { FuelPass, FuelPassSettings, QrImage, QuotaBar, categoryName, litres, printPass, resetText } from "../fuel/_components/fuelPass";

const WRITERS = ["FUEL_STATION_SUPERVISOR", "SUPER_ADMIN"];
const EMPTY_FORM = { vehicleRegNo: "", vehicleCategory: "CAR", ownerName: "" };

// Fuel pass register: every vehicle's QR pass with this week's quota use. The
// supervisor issues a pass for a walk-in vehicle, prints it and can suspend it.
export default function FuelPassesPage() {
  const { user } = useAuth();
  const canWrite = WRITERS.includes(user?.role || "");

  const [passes, setPasses] = useState<FuelPass[]>([]);
  const [settings, setSettings] = useState<FuelPassSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState<FuelPass | null>(null);

  // Bumped to fetch the list again after a change.
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    let live = true;
    Promise.all([api.get<FuelPass[]>("/fuel-pass"), api.get<FuelPassSettings>("/fuel-pass/settings")])
      .then(([list, conf]) => {
        if (!live) return;
        setPasses(list.data);
        setSettings(conf.data);
        setError("");
      })
      .catch(err => { if (live) setError(errText(err, "Couldn't load the fuel passes.")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [reloadKey]);

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShown(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return passes;
    return passes.filter(p => [p.vehicleRegNo, p.code, p.ownerName, p.customerUsername, categoryName(p.vehicleCategory)]
      .some(v => v?.toLowerCase().includes(q)));
  }, [passes, search]);

  const totals = useMemo(() => ({
    active: passes.filter(p => p.status === "ACTIVE").length,
    used: passes.reduce((sum, p) => sum + p.usedThisWeek, 0),
    exhausted: passes.filter(p => p.status === "ACTIVE" && p.remaining <= 0).length,
  }), [passes]);

  const issue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const res = await api.post<FuelPass>("/fuel-pass", { ...form, vehicleRegNo: form.vehicleRegNo.trim().toUpperCase() });
      setForm(EMPTY_FORM);
      setShown(res.data);
      setNotice(`Fuel pass issued for ${res.data.vehicleRegNo}.`);
      load();
    } catch (err) {
      setError(errText(err, "Couldn't issue the fuel pass."));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (p: FuelPass, active: boolean) => {
    setError("");
    setNotice("");
    try {
      await api.put(`/fuel-pass/${p.passId}/status`, null, { params: { active } });
      setNotice(`Fuel pass for ${p.vehicleRegNo} ${active ? "reactivated" : "suspended"}.`);
      load();
    } catch (err) {
      setError(errText(err, "Couldn't update the fuel pass."));
    }
  };

  const print = async (p: FuelPass) => {
    if (!(await printPass(p))) setError("Allow pop-ups for this site to print the pass.");
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] animate-fade-in-up">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Fuel Passes</h1>
        <p className="text-slate-500 font-medium mt-1">
          QR passes scanned at the pump. Each vehicle gets a weekly fuel quota by category
          {settings ? `; the week resets on ${resetText(settings.resetsAt)}.` : "."}
        </p>
      </div>

      {error && <p role="alert" className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-sm font-bold text-red-700">{error}</p>}
      {notice && <p className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm font-bold text-emerald-700">{notice}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Active passes", value: String(totals.active), note: `${passes.length} issued in total` },
          { label: "Sold on passes this week", value: litres(Math.round(totals.used * 100) / 100), note: settings ? `Since ${new Date(settings.weekStart).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}` : "" },
          { label: "Quota used up", value: String(totals.exhausted), note: "Vehicles with nothing left this week" },
        ].map(card => (
          <div key={card.label} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{card.value}</p>
            <p className="text-xs font-bold text-slate-500 mt-1">{card.note}</p>
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-1 ${canWrite ? "xl:grid-cols-3" : ""} gap-8`}>
        {canWrite && (
          <div className="xl:col-span-1 space-y-6">
            <form onSubmit={issue} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">Issue a pass</h2>
              <div>
                <label htmlFor="fp-vehicle" className="block text-sm font-bold text-slate-700 mb-1">Vehicle number</label>
                <input id="fp-vehicle" required maxLength={15} value={form.vehicleRegNo} placeholder="e.g., CAB-4521"
                  onChange={e => setForm(f => ({ ...f, vehicleRegNo: e.target.value }))}
                  className={`${inputClass} uppercase font-mono font-bold placeholder:normal-case placeholder:font-sans placeholder:font-medium`} />
              </div>
              <div>
                <label htmlFor="fp-category" className="block text-sm font-bold text-slate-700 mb-1">Vehicle category</label>
                <select id="fp-category" value={form.vehicleCategory} onChange={e => setForm(f => ({ ...f, vehicleCategory: e.target.value }))} className={inputClass}>
                  {Object.entries(settings?.weeklyQuota ?? { CAR: 15 }).map(([key, quota]) => (
                    <option key={key} value={key}>{categoryName(key)} — {quota} L per week</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="fp-owner" className="block text-sm font-bold text-slate-700 mb-1">Owner name <span className="font-medium text-slate-400">(optional)</span></label>
                <input id="fp-owner" maxLength={80} value={form.ownerName} onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))} className={inputClass} />
              </div>
              <button type="submit" disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-xl shadow-lg disabled:opacity-60 uppercase tracking-widest text-xs">
                {saving ? "Issuing…" : "Issue fuel pass"}
              </button>
              <p className="text-[11px] font-medium text-slate-400">Registered customers can also get the pass for their own vehicle from their portal.</p>
            </form>

            {settings && (
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-3">Weekly quota</h2>
                <dl className="space-y-1.5 text-sm">
                  {Object.entries(settings.weeklyQuota).map(([key, quota]) => (
                    <div key={key} className="flex justify-between">
                      <dt className="font-medium text-slate-600">{categoryName(key)}</dt>
                      <dd className="font-black text-slate-900">{quota} L</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[11px] font-medium text-slate-400">
                  {settings.mode === "NATIONAL"
                    ? "This station sells on the National Fuel Pass; these station passes are not used at the pump."
                    : settings.required
                      ? settings.mode === "BOTH" ? "Every fuel sale needs a station pass or a confirmed National Fuel Pass deduction." : "A pass is required for every fuel sale."
                      : "A pass is optional for fuel sales."}
                </p>
              </div>
            )}
          </div>
        )}

        <div className={canWrite ? "xl:col-span-2" : ""}>
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <h2 className="text-xl font-bold text-slate-800">Issued passes</h2>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vehicle, code, owner…" aria-label="Search passes"
                className="sm:w-72 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none text-sm" />
            </div>

            {loading ? (
              <p className="py-10 text-center text-sm font-bold text-slate-400">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm font-bold text-slate-400">
                {passes.length === 0 ? "No fuel passes issued yet." : "No pass matches that search."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map(p => (
                  <li key={p.passId} className="py-4 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="md:w-52 shrink-0 min-w-0">
                      <p className="text-lg font-black font-mono text-slate-900 truncate">{p.vehicleRegNo}</p>
                      <p className="text-xs font-bold text-slate-500 truncate">
                        {categoryName(p.vehicleCategory)}{p.ownerName ? ` · ${p.ownerName}` : ""}
                      </p>
                      {p.status !== "ACTIVE" && (
                        <span className="mt-1 inline-block px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[10px] font-black uppercase tracking-widest text-red-700">Suspended</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-800 mb-1">{litres(p.remaining)} left</p>
                      <QuotaBar pass={p} />
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end shrink-0">
                      <button type="button" onClick={() => setShown(p)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest hover:bg-slate-700">Show QR</button>
                      {canWrite && (
                        <button type="button" onClick={() => setStatus(p, p.status !== "ACTIVE")}
                          className={`px-3 py-1.5 rounded-lg border text-[11px] font-black uppercase tracking-widest ${p.status === "ACTIVE" ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                          {p.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* In <body>, so the page's entry animation can't offset the overlay. */}
      {shown && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Fuel pass ${shown.vehicleRegNo}`}
          onClick={e => { if (e.target === e.currentTarget) setShown(null); }}>
          <div className="w-full max-w-sm max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-3xl shadow-2xl text-center">
            <div className="bg-slate-900 text-white px-6 py-4 rounded-t-3xl">
              <p className="font-black text-lg">Lanka Auto Care</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">Fuel Pass</p>
            </div>
            <div className="p-6">
              <QrImage text={shown.qrText} size={230} className="mx-auto border border-slate-200" />
              <p className="mt-4 text-3xl font-black font-mono text-slate-900">{shown.vehicleRegNo}</p>
              <p className="text-sm font-bold text-slate-500">
                {categoryName(shown.vehicleCategory)} · {shown.weeklyQuota} L per week
              </p>
              <p className="mt-1 font-mono text-xs tracking-[0.14em] text-slate-500">{shown.code}</p>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => print(shown)}
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest">Print</button>
                <button type="button" onClick={() => setShown(null)}
                  className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-100">Close</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
