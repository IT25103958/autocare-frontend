"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../../utils/axiosInstance";
import SlotPicker from "../../bookings/_components/SlotPicker";
import { ServicePackage, errorText, fmtDuration, fmtWhen, rupees } from "../../bookings/_components/booking";

// Supports WP-CBA-1234, WP-CA-1234, CBA-1234 and 301-1234.
const VEHICLE_PATTERN = /^([A-Z]{2}-)?([A-Z]{2,3}|[0-9]{1,4})-[0-9]{4}$/;

export default function BookServicePage() {
  const router = useRouter();
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [packageId, setPackageId] = useState<number | null>(null);
  const [vehicle, setVehicle] = useState("");
  const [slot, setSlot] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });
  const [vehicleError, setVehicleError] = useState("");

  useEffect(() => {
    api.get<ServicePackage[]>("/service-packages").then(res => {
      setPackages(res.data);
      if (res.data.length) setPackageId(res.data[0].packageId);
    }).catch(() => setServerMessage({ type: "error", text: "Couldn't load services. Please refresh." }));
    // Pre-fill the vehicle on the customer's profile.
    api.get<{ vehicleRegNo: string }>("/customers/my-profile").then(res => setVehicle(res.data.vehicleRegNo || "")).catch(() => {});
  }, []);

  const selected = packages.find(p => p.packageId === packageId) || null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerMessage({ type: "", text: "" });
    const reg = vehicle.trim().toUpperCase();
    if (!VEHICLE_PATTERN.test(reg)) {
      setVehicleError("Invalid format (e.g., WP-CBA-1234, WP-CA-1234, 301-1234)");
      return;
    }
    setVehicleError("");
    setSubmitting(true);
    try {
      await api.post("/bookings", { vehicleRegNo: reg, packageId, preferredDate: slot, customerNotes: notes });
      setServerMessage({ type: "success", text: "Booking received! We'll email you once the workshop confirms. Redirecting to your garage..." });
      setTimeout(() => router.push("/customers/dashboard"), 2000);
    } catch (err) {
      setServerMessage({ type: "error", text: errorText(err, "Failed to schedule appointment. Please try again.") });
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">

        <div className="mb-8">
          <Link href="/customers/dashboard" className="text-sm font-bold text-slate-500 hover:text-blue-600 flex items-center gap-2 transition-colors w-max">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Garage
          </Link>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
            <div className="relative z-10">
              <h1 className="text-3xl font-black tracking-tight mb-2">Schedule Service</h1>
              <p className="text-slate-300 font-medium">Choose a service, then pick a free time slot at the workshop.</p>
            </div>
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
          </div>

          <form onSubmit={onSubmit} className="p-6 sm:p-8 space-y-8">
            {serverMessage.text && (
              <div role="status" className={`p-4 rounded-xl text-sm font-bold ${serverMessage.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {serverMessage.text}
              </div>
            )}

            {/* 1. Service */}
            <fieldset>
              <legend className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">1. Service</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup">
                {packages.map(p => (
                  <button key={p.packageId} type="button" role="radio" aria-checked={packageId === p.packageId}
                    onClick={() => { setPackageId(p.packageId); setSlot(""); }}
                    className={`text-left border-2 rounded-2xl p-4 transition-all ${packageId === p.packageId ? "border-blue-600 bg-blue-50/50 shadow-sm" : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                      <span className="font-black text-slate-900 text-sm whitespace-nowrap tabular-nums">{rupees(p.price)}</span>
                    </div>
                    {p.description && <p className="text-xs text-slate-500 mt-1">{p.description}</p>}
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-2">About {fmtDuration(p.durationMinutes)}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">Prices are for labour; any parts needed are added to the final bill.</p>
            </fieldset>

            {/* 2. Vehicle */}
            <div>
              <label htmlFor="vehicle" className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">2. Vehicle Registration No.</label>
              <input id="vehicle" value={vehicle} onChange={e => setVehicle(e.target.value.toUpperCase())} placeholder="e.g., WP-CBA-1234"
                className={`w-full px-4 py-3.5 rounded-xl border outline-none transition-all bg-slate-50 focus:bg-white font-bold text-slate-800 uppercase ${vehicleError ? "border-red-400 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"}`} />
              {vehicleError && <p className="mt-2 text-xs font-bold text-red-600">{vehicleError}</p>}
            </div>

            {/* 3. Time */}
            <div>
              <p className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">3. Appointment</p>
              <SlotPicker packageId={packageId} value={slot} onChange={setSlot} />
            </div>

            {/* 4. Notes */}
            <div>
              <label htmlFor="notes" className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">4. Anything we should know? <span className="normal-case font-medium text-slate-500">(optional)</span></label>
              <textarea id="notes" value={notes} maxLength={500} onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Squeaking noise from the front left wheel when braking."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none h-24 resize-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
            </div>

            {selected && slot && (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
                <span className="font-bold">{selected.name}</span> on <span className="font-bold">{fmtWhen(slot)}</span> · from <span className="font-bold">{rupees(selected.price)}</span>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100">
              <button type="submit" disabled={submitting || !packageId || !slot || serverMessage.type === "success"}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                {submitting ? "Booking..." : slot ? "Confirm Booking Request" : "Choose a time slot"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
