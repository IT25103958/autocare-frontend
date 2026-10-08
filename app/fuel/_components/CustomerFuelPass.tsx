"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { errText } from "../../billing/_components/billing";
import { FuelPass, FuelPassSettings, QrImage, pointsRule, printPass } from "./fuelPass";

// Customer portal: the customer's fuel rewards card for the vehicle on their
// profile — the QR they show at the pump to earn loyalty points on fuel. If they
// don't have one yet they get it with one tap.
export default function CustomerFuelPass() {
  const [passes, setPasses] = useState<FuelPass[] | null>(null);
  const [settings, setSettings] = useState<FuelPassSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<FuelPass[]>("/fuel-pass/my").then(res => setPasses(res.data)).catch(() => setPasses([]));
    api.get<FuelPassSettings>("/fuel-pass/settings").then(res => setSettings(res.data)).catch(() => setSettings(null));
  }, []);

  if (passes === null) return null;
  const rule = settings ? pointsRule(settings.pointsPerLitre) : "Earn points";

  const getPass = async () => {
    setError("");
    setSaving(true);
    try {
      const res = await api.post<FuelPass>("/fuel-pass/my");
      setPasses([res.data]);
    } catch (err) {
      setError(errText(err, "Couldn't create your rewards card."));
    } finally {
      setSaving(false);
    }
  };

  const print = async (p: FuelPass) => {
    setError("");
    if (!(await printPass(p, settings?.pointsPerLitre))) setError("Allow pop-ups for this site to print the card.");
  };

  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: "0.25s" }}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Fuel Rewards Card</h2>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Show at the pump</span>
      </div>

      {error && <p role="alert" className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm font-bold text-red-700">{error}</p>}

      {passes.length === 0 ? (
        <div>
          <p className="text-sm text-slate-600">
            Show your rewards card when you fill up and earn loyalty points on every litre — spend the points on your service bills.
            It doesn&apos;t replace the National Fuel Pass, which the attendant still scans as usual.
          </p>
          <button type="button" onClick={getPass} disabled={saving}
            className="mt-4 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-60">
            {saving ? "Creating…" : "Get my rewards card"}
          </button>
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
                <p className="text-sm font-bold text-slate-500">Code {p.code}</p>
                {p.status !== "ACTIVE" && (
                  <p className="mt-2 inline-block px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-[11px] font-black uppercase tracking-widest text-red-700">Suspended — contact the station</p>
                )}
                <p className="mt-4 text-lg font-black text-slate-900">{rule}</p>
                <p className="text-sm text-slate-500">Points go to your loyalty balance and can be spent on service bills.</p>
                <button type="button" onClick={() => print(p)}
                  className="mt-4 px-4 py-2 rounded-xl border border-slate-300 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-100">
                  Print card
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
