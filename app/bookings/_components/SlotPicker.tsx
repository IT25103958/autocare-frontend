"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { Slot, fmtTime, isoDate } from "./booking";

// Date + time-slot chooser. Slots come from the server, which knows bay
// capacity, opening hours and the package's duration.
export default function SlotPicker({ packageId, value, onChange, maxDaysAhead = 60 }: {
  packageId: number | null;
  value: string;                 // selected slot ISO time ("" = none)
  onChange: (time: string) => void;
  maxDaysAhead?: number;
}) {
  const today = new Date();
  const [date, setDate] = useState(value ? value.slice(0, 10) : isoDate(today));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!packageId || !date) { setSlots(null); return; }
    setSlots(null);
    setError("");
    api.get<Slot[]>("/bookings/availability", { params: { date, packageId } })
      .then(res => setSlots(res.data))
      .catch(() => setError("Couldn't load available times."));
  }, [packageId, date]);

  const max = new Date(today);
  max.setDate(max.getDate() + maxDaysAhead);
  const open = slots?.filter(s => s.available) ?? [];

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="slot-date" className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Date</label>
        <input id="slot-date" type="date" value={date} min={isoDate(today)} max={isoDate(max)}
          onChange={e => { setDate(e.target.value); onChange(""); }}
          className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
      </div>

      <div>
        <p className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Time</p>
        {!packageId ? (
          <p className="text-sm text-slate-500">Choose a service first.</p>
        ) : error ? (
          <p className="text-sm font-bold text-red-600">{error}</p>
        ) : slots === null ? (
          <p className="text-sm text-slate-500">Checking availability...</p>
        ) : open.length === 0 ? (
          <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">No free times on this day — please try another date.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="radiogroup" aria-label="Available times">
            {slots.map(s => (
              <button key={s.time} type="button" role="radio" aria-checked={value === s.time}
                disabled={!s.available} onClick={() => onChange(s.time)}
                className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
                  value === s.time ? "bg-blue-600 border-blue-600 text-white shadow-md"
                  : s.available ? "bg-white border-slate-200 text-slate-800 hover:border-blue-400"
                  : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed line-through"}`}>
                {fmtTime(s.time)}
                {s.available && s.remaining === 1 && value !== s.time && <span className="block text-[9px] font-black uppercase tracking-wider text-orange-700">Last bay</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
