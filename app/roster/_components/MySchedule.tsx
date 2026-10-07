"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { LeaveStatus } from "./LeaveReview";
import { BLOCK_LABEL, Leave, Notice, Shift, StatusBadge, errorText, fmtDay, fmtTime, inputClass, isoDate } from "./roster";

interface Hours {
  month: string;
  rosteredShifts: number;
  completedShifts: number;
  absentShifts: number;
  lateShifts: number;
  openShifts: number;
  workedHours: number;
}

// A staff member's own schedule: acknowledge shifts, clock in/out, see this
// month's hours, and request leave.
export default function MySchedule({ username }: { username: string }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [hours, setHours] = useState<Hours | null>(null);
  const [leave, setLeave] = useState<Leave[]>([]);
  const [earlyMinutes, setEarlyMinutes] = useState(30);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [leaveForm, setLeaveForm] = useState({ fromDate: "", toDate: "", reason: "" });
  const [sendingLeave, setSendingLeave] = useState(false);

  const month = isoDate(new Date()).slice(0, 7);

  const load = () => {
    api.get<Shift[]>("/roster/my").then(res => setShifts(res.data)).catch(() => setShifts([]));
    api.get<Hours>("/roster/hours", { params: { username, month } }).then(res => setHours(res.data)).catch(() => setHours(null));
    api.get<Leave[]>("/roster/leave/my").then(res => setLeave(res.data)).catch(() => setLeave([]));
  };

  useEffect(() => {
    load();
    api.get<{ clockInEarlyMinutes: number }>("/roster/resources").then(res => setEarlyMinutes(res.data.clockInEarlyMinutes)).catch(() => {});
    const timer = setInterval(() => setTick(t => t + 1), 30_000); // re-evaluate the clock-in window
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on open
  }, []);

  const act = async (s: Shift, action: "acknowledge" | "clock-in" | "clock-out", done: string) => {
    setBusy(s.shiftId);
    try {
      await api.put(`/roster/${s.shiftId}/${action}`);
      setNotice({ type: "ok", text: done });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "That didn't work — please try again.") });
    } finally {
      setBusy(null);
    }
  };

  const requestLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingLeave(true);
    try {
      await api.post("/roster/leave", leaveForm);
      setLeaveForm({ fromDate: "", toDate: "", reason: "" });
      setNotice({ type: "ok", text: "Leave request sent to your manager." });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't send the request.") });
    } finally {
      setSendingLeave(false);
    }
  };

  const cancelLeave = async (l: Leave) => {
    try {
      await api.put(`/roster/leave/${l.leaveId}/cancel`);
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't cancel.") });
    }
  };

  const now = new Date();
  const isCurrentOrUpcoming = (s: Shift) =>
    s.status === "CHECKED_IN" || (!!s.scheduledEnd && new Date(s.scheduledEnd) > now && s.status !== "CANCELLED");
  const upcoming = shifts.filter(isCurrentOrUpcoming).sort((a, b) => (a.scheduledStart || "").localeCompare(b.scheduledStart || ""));
  const history = shifts.filter(s => !isCurrentOrUpcoming(s)).sort((a, b) => (b.scheduledStart || "").localeCompare(a.scheduledStart || "")).slice(0, 15);

  const clockInOpen = (s: Shift) =>
    ["SCHEDULED", "CONFIRMED"].includes(s.status) && !!s.scheduledStart && !!s.scheduledEnd
    && now >= new Date(new Date(s.scheduledStart).getTime() - earlyMinutes * 60_000) && now < new Date(s.scheduledEnd);

  const today = isoDate(now);

  return (
    <div className="space-y-6">
      <Notice notice={notice} />

      {hours && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ["Hours worked", `${hours.workedHours} h`, "This month, from clock-in/out"],
            ["Shifts done", String(hours.completedShifts), `${hours.openShifts} still to come`],
            ["Late arrivals", String(hours.lateShifts), "This month"],
            ["Absences", String(hours.absentShifts), "This month"],
          ].map(([label, value, sub]) => (
            <div key={label} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</h3>
              <div className="text-3xl font-black text-slate-900 tabular-nums">{value}</div>
              <p className="text-xs font-bold text-slate-500 mt-1">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming & current */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100"><h2 className="text-lg font-black text-slate-900">My Upcoming Shifts</h2></div>
        {upcoming.length === 0 ? (
          <p className="px-6 py-8 text-center text-slate-500">No upcoming shifts.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map(s => (
              <li key={s.shiftId} className={`px-6 py-4 flex flex-wrap items-center justify-between gap-4 ${s.status === "CHECKED_IN" ? "bg-indigo-50/40" : ""}`}>
                <div>
                  <p className="font-black text-slate-900">{fmtDay(s.shiftDate)}{s.shiftDate === today && <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-blue-700">Today</span>}</p>
                  <p className="text-sm text-slate-600">{BLOCK_LABEL[s.shiftType]}{s.assignment && <> · <span className="font-bold">{s.assignment}</span></>}</p>
                  {s.status === "CHECKED_IN" && <p className="text-xs font-bold text-indigo-700 mt-1">Clocked in at {fmtTime(s.clockInAt)}{s.late ? ` · ${s.lateMinutes} min late` : ""}</p>}
                  {s.notes && <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{s.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={s.status} />
                  {s.status === "SCHEDULED" && !clockInOpen(s) && (
                    <button disabled={busy === s.shiftId} onClick={() => act(s, "acknowledge", "Shift acknowledged.")}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">Acknowledge</button>
                  )}
                  {clockInOpen(s) && (
                    <button disabled={busy === s.shiftId} onClick={() => act(s, "clock-in", "Clocked in. Have a good shift!")}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">Clock In</button>
                  )}
                  {s.status === "CHECKED_IN" && (
                    <button disabled={busy === s.shiftId} onClick={() => act(s, "clock-out", "Clocked out.")}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">Clock Out</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="px-6 py-3 text-xs text-slate-500 border-t border-slate-100">Clock-in opens {earlyMinutes} minutes before your shift starts.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* History */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100"><h2 className="text-lg font-black text-slate-900">Recent Shifts</h2></div>
          {history.length === 0 ? (
            <p className="px-6 py-8 text-center text-slate-500">No past shifts yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.map(s => (
                <li key={s.shiftId} className="px-6 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{fmtDay(s.shiftDate)} · {s.shiftType.toLowerCase()}</p>
                    <p className="text-xs text-slate-500 tabular-nums">{fmtTime(s.clockInAt)} – {fmtTime(s.clockOutAt)}{s.late ? ` · ${s.lateMinutes} min late` : ""}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={s.status} />
                    {s.workedHours != null && <p className="text-xs font-bold text-slate-700 tabular-nums mt-1">{s.workedHours} h</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Leave */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-black text-slate-900">Leave</h2>
          <form onSubmit={requestLeave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="lv-from" className="block text-xs font-bold text-slate-700 mb-1">From</label>
                <input id="lv-from" type="date" min={today} value={leaveForm.fromDate} onChange={e => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} className={inputClass} required />
              </div>
              <div>
                <label htmlFor="lv-to" className="block text-xs font-bold text-slate-700 mb-1">To</label>
                <input id="lv-to" type="date" min={leaveForm.fromDate || today} value={leaveForm.toDate} onChange={e => setLeaveForm({ ...leaveForm, toDate: e.target.value })} className={inputClass} required />
              </div>
            </div>
            <div>
              <label htmlFor="lv-reason" className="block text-xs font-bold text-slate-700 mb-1">Reason</label>
              <input id="lv-reason" value={leaveForm.reason} maxLength={300} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} className={inputClass} placeholder="e.g. Family event" required />
            </div>
            <button type="submit" disabled={sendingLeave || leaveForm.reason.trim().length < 5} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
              {sendingLeave ? "Sending..." : "Request Leave"}
            </button>
          </form>

          {leave.length > 0 && (
            <ul className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
              {leave.map(l => (
                <li key={l.leaveId} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{fmtDay(l.fromDate)} – {fmtDay(l.toDate)} <span className="font-medium text-slate-500">({l.days}d)</span></p>
                    <p className="text-xs text-slate-600">{l.reason}</p>
                    {l.reviewNote && <p className="text-xs text-slate-500 mt-0.5">Manager: {l.reviewNote}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <LeaveStatus status={l.status} />
                    {l.status === "PENDING" && (
                      <button onClick={() => cancelLeave(l)} className="block ml-auto mt-1 text-xs font-bold text-slate-500 hover:text-red-600">Cancel</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
