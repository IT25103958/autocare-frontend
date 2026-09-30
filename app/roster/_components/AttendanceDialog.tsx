"use client";

import { useState } from "react";
import api from "../../../utils/axiosInstance";
import { Shift, errorText, fmtDay, inputClass, toLocalInput } from "./roster";

// Manager correction of a shift's clock times (forgotten clock-in/out, wrong
// times, auto clock-out). Always requires a reason; the result is COMPLETED.
export default function AttendanceDialog({ shift, onClose, onSaved }: {
  shift: Shift;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [clockIn, setClockIn] = useState(toLocalInput(shift.clockInAt) || toLocalInput(shift.scheduledStart));
  const [clockOut, setClockOut] = useState(toLocalInput(shift.clockOutAt) || toLocalInput(shift.scheduledEnd));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.put(`/roster/${shift.shiftId}/attendance`, { clockInAt: clockIn + ":00", clockOutAt: clockOut + ":00", reason });
      onSaved(`Attendance corrected for ${shift.staffName}.`);
    } catch (err) {
      setError(errorText(err, "Couldn't save the correction."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="att-title">
      <form onSubmit={save} className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-md w-full border border-slate-200 space-y-4">
        <div>
          <h3 id="att-title" className="text-xl font-black text-slate-900">Correct Attendance</h3>
          <p className="text-sm text-slate-500 mt-1">{shift.staffName} · {fmtDay(shift.shiftDate)} · {shift.shiftType.toLowerCase()} shift</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="att-in" className="block text-xs font-bold text-slate-700 mb-1">Clock in</label>
            <input id="att-in" type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label htmlFor="att-out" className="block text-xs font-bold text-slate-700 mb-1">Clock out</label>
            <input id="att-out" type="datetime-local" value={clockOut} onChange={e => setClockOut(e.target.value)} className={inputClass} required />
          </div>
        </div>
        <div>
          <label htmlFor="att-reason" className="block text-xs font-bold text-slate-700 mb-1">Reason</label>
          <input id="att-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={200}
            placeholder="e.g. Forgot to clock out — confirmed with supervisor" className={inputClass} />
        </div>
        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving || reason.trim().length < 5} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Saving..." : "Save Correction"}
          </button>
        </div>
      </form>
    </div>
  );
}
