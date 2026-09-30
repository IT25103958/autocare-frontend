"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { Booking, errorText, fmtWhen, inputClass, jobRef } from "./booking";

interface TechOption {
  username: string;
  fullName: string;
  shift: string | null;
  rosteredBay: string | null;
  onLeave: boolean;
  busyWith: string | null;
  available: boolean;
}

interface Options {
  technicians: TechOption[];
  bays: { bay: string; busyWith: string | null }[];
}

// Confirm a booking by assigning a technician and bay. Options are flagged with
// roster status (must be on shift at the job time), leave and clashes.
export default function AssignDialog({ booking, onClose, onSaved }: {
  booking: Booking;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [tech, setTech] = useState(booking.assignedTechnicianUsername || "");
  const [bay, setBay] = useState(booking.assignedServiceBay || "");
  const [notes, setNotes] = useState(booking.managerNotes || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Options>(`/bookings/${booking.bookingID}/assignment-options`)
      .then(res => {
        setOptions(res.data);
        // Suggest the technician's rostered bay when it's free.
        if (!bay) {
          const firstFree = res.data.bays.find(b => !b.busyWith);
          if (firstFree) setBay(firstFree.bay);
        }
      })
      .catch(err => setError(errorText(err, "Couldn't load technicians.")));
  }, [booking.bookingID]);

  const pickTech = (t: TechOption) => {
    setTech(t.username);
    const rosteredFree = t.rosteredBay && options?.bays.find(b => b.bay === t.rosteredBay && !b.busyWith);
    if (rosteredFree) setBay(t.rosteredBay!);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.put(`/bookings/${booking.bookingID}/assign`, { technicianUsername: tech, bay, managerNotes: notes });
      onSaved(`${jobRef(booking.bookingID)} confirmed — the customer has been emailed.`);
    } catch (err) {
      setError(errorText(err, "Couldn't assign the job."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="assign-title">
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-2xl w-full border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">
        <div>
          <h3 id="assign-title" className="text-xl font-black text-slate-900">{booking.status === "CONFIRMED" ? "Reassign" : "Confirm & Assign"} {jobRef(booking.bookingID)}</h3>
          <p className="text-sm text-slate-500 mt-1">{booking.servicePackage} · <span className="font-mono">{booking.vehicleRegNo}</span> · {fmtWhen(booking.preferredDate)}</p>
          {booking.customerNotes && <p className="text-sm text-slate-700 mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl"><span className="font-bold">Customer: </span>{booking.customerNotes}</p>}
        </div>

        <div>
          <p className="text-xs font-bold text-slate-700 mb-2">Technician</p>
          {!options ? <p className="text-sm text-slate-500">Loading...</p> : options.technicians.length === 0 ? (
            <p className="text-sm text-slate-500">No technicians found.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Technician">
              {options.technicians.map(t => (
                <li key={t.username}>
                  <button type="button" role="radio" aria-checked={tech === t.username} disabled={!t.available} onClick={() => pickTech(t)}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${tech === t.username ? "border-blue-600 bg-blue-50/50" : t.available ? "border-slate-100 hover:border-slate-300" : "border-slate-100 bg-slate-50 opacity-70 cursor-not-allowed"}`}>
                    <p className="font-bold text-slate-900 text-sm">{t.fullName}</p>
                    <p className={`text-xs mt-0.5 ${t.available ? "text-emerald-700" : "text-slate-500"}`}>
                      {t.onLeave ? "On leave" : !t.shift ? "Not rostered at this time" : t.busyWith ? `Busy on ${t.busyWith}` : `On ${t.shift.toLowerCase()} shift${t.rosteredBay ? " · " + t.rosteredBay.replace(/ - .*/, "") : ""}`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500 mt-2">Only technicians rostered at the job's time can be assigned — add a shift on the Technician Roster if needed.</p>
        </div>

        <div>
          <label htmlFor="assign-bay" className="block text-xs font-bold text-slate-700 mb-1">Service bay</label>
          <select id="assign-bay" value={bay} onChange={e => setBay(e.target.value)} className={inputClass}>
            <option value="">Choose a bay...</option>
            {options?.bays.map(b => (
              <option key={b.bay} value={b.bay} disabled={!!b.busyWith}>{b.bay}{b.busyWith ? ` — busy (${b.busyWith})` : ""}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="assign-notes" className="block text-xs font-bold text-slate-700 mb-1">Instructions for the technician <span className="font-medium text-slate-500">(optional)</span></label>
          <textarea id="assign-notes" value={notes} maxLength={1000} onChange={e => setNotes(e.target.value)} className={`${inputClass} h-20 resize-none`} />
        </div>

        {error && <p className="text-sm font-bold text-red-600">{error}</p>}

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
          <button onClick={save} disabled={!tech || !bay || saving} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : booking.status === "CONFIRMED" ? "Reassign" : "Confirm Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
