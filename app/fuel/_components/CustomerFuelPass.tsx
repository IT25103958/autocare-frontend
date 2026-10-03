"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { errText } from "../../billing/_components/billing";
import { FuelPass, FuelPassSettings, QrImage, QuotaBar, categoryName, litres, printPass } from "./fuelPass";

// Customer portal: the customer's fuel pass for the vehicle on their profile —
// the QR they show at the pump, with this week's quota. If they don't have one
// yet they pick the vehicle category and get it straight away.
export default function CustomerFuelPass() {
  const [passes, setPasses] = useState<FuelPass[] | null>(null);
  const [settings, setSettings] = useState<FuelPassSettings | null>(null);
  const [category, setCategory] = useState("CAR");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<FuelPass[]>("/fuel-pass/my").then(res => setPasses(res.data)).catch(() => setPasses([]));
    api.get<FuelPassSettings>("/fuel-pass/settings").then(res => setSettings(res.data)).catch(() => setSettings(null));
  }, []);

  // The station sells on the National Fuel Pass only: there is no station pass to show.
  if (passes === null || settings?.localEnabled === false) return null;

  const getPass = async () => {
    setError("");
    setSaving(true);
    try {
      const res = await api.post<FuelPass>("/fuel-pass/my", { vehicleCategory: category });
      setPasses([res.data]);
    } catch (err) {
      setError(errText(err, "Couldn't create your fuel pass."));
    } finally {
      setSaving(false);
    }
  };

  const print = async (p: FuelPass) => {
    setError("");
    if (!(await printPass(p))) setError("Allow pop-ups for this site to print the pass.");
  };

  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: "0.25s" }}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Fuel Pass</h2>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Show at the pump</span>
      </div>

      {error && <p role="alert" className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm font-bold text-red-700">{error}</p>}

      {passes.length === 0 ? (
        <div>
          <p className="text-sm text-slate-600">
            Fuel at our station is sold against a weekly quota. Get the QR pass for your vehicle and show it to the attendant when you fill up.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Vehicle category"
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-bold text-slate-800">
              {Object.entries(settings?.weeklyQuota ?? { CAR: 15 }).map(([key, quota]) => (
                <option key={key} value={key}>{categoryName(key)} — {quota} L per week</option>
              ))}
            </select>
            <button type="button" onClick={getPass} disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-60">
              {saving ? "Creating…" : "Get my fuel pass"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {passes.map(p => (
            <div key={p.passId} className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
              <div className="p-3 rounded-2xl border border-slate-200 shrink-0">
                <QrImage text={p.qrText} size={176} />
              </div>
              <div className="flex-1 min-w-0 w-full">
                <p className="text-2xl font-black font-mono text-slate-900">{p.vehicleRegNo}</p>
                <p className="text-sm font-bold text-slate-500">{categoryName(p.vehicleCategory)} · code {p.code}</p>
                {p.status !== "ACTIVE" && (
                  <p className="mt-2 inline-block px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-[11px] font-black uppercase tracking-widest text-red-700">Suspended — contact the station</p>
                )}
                <p className="mt-4 text-3xl font-black text-slate-900">
                  {litres(p.remaining)} <span className="text-sm font-bold text-slate-500">left this week</span>
                </p>
                <div className="mt-2"><QuotaBar pass={p} /></div>
                <button type="button" onClick={() => print(p)}
                  className="mt-4 px-4 py-2 rounded-xl border border-slate-300 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-100">
                  Print pass
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
