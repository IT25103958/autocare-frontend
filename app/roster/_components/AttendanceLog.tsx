"use client";

import { useEffect, useMemo, useState } from "react";
import api from "../../../utils/axiosInstance";
import AttendanceDialog from "./AttendanceDialog";
import { Notice, Shift, StatusBadge, errorText, fmtDay, fmtTime, isoDate, roleLabel } from "./roster";

// Attendance ledger for a date range: clock times, hours, lateness, absences,
// with a per-person summary and manager corrections.
export default function AttendanceLog({ canManage }: { canManage: boolean }) {
  const now = new Date();
  const [from, setFrom] = useState(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(isoDate(now));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [person, setPerson] = useState("ALL");
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [correcting, setCorrecting] = useState<Shift | null>(null);

  const load = () => {
    api.get<Shift[]>("/roster", { params: { from, to } })
      .then(res => setShifts(res.data.filter(s => s.scheduledStart && new Date(s.scheduledStart) <= new Date())))
      .catch(err => setNotice({ type: "error", text: errorText(err, "Couldn't load attendance.") }));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the date range changes
  useEffect(() => { load(); }, [from, to]);

  const people = Array.from(new Map(shifts.map(s => [s.staffUsername || s.staffName, s.staffName])).entries())
    .sort((a, b) => a[1].localeCompare(b[1]));

  // The summary follows the Staff filter too, so it always describes the rows below it.
  const visible = useMemo(() => shifts
    .filter(s => person === "ALL" || (s.staffUsername || s.staffName) === person)
    .sort((a, b) => (b.scheduledStart || "").localeCompare(a.scheduledStart || "")), [shifts, person]);

  const summary = useMemo(() => {
    const map = new Map<string, { name: string; role: string; worked: number; completed: number; absent: number; late: number; flagged: number }>();
    for (const s of visible) {
      const key = s.staffUsername || s.staffName;
      const row = map.get(key) ?? { name: s.staffName, role: s.role, worked: 0, completed: 0, absent: 0, late: 0, flagged: 0 };
      if (s.status === "COMPLETED") { row.completed++; row.worked += s.workedHours ?? 0; }
      if (s.status === "ABSENT") row.absent++;
      if (s.late) row.late++;
      if (s.autoClosed) row.flagged++;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [visible]);

  const markAbsent = async (s: Shift) => {
    const reason = prompt(`Mark ${s.staffName} absent for ${fmtDay(s.shiftDate)}? Optional reason:`);
    if (reason === null) return;
    try {
      await api.put(`/roster/${s.shiftId}/absent`, { reason });
      setNotice({ type: "ok", text: `${s.staffName} marked absent.` });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't mark absent.") });
    }
  };

  const dateInput = "px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="att-from" className="block text-xs font-bold text-slate-700 mb-1">From</label>
          <input id="att-from" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className={dateInput} />
        </div>
        <div>
          <label htmlFor="att-to" className="block text-xs font-bold text-slate-700 mb-1">To</label>
          <input id="att-to" type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={dateInput} />
        </div>
        <div>
          <label htmlFor="att-person" className="block text-xs font-bold text-slate-700 mb-1">Staff</label>
          <select id="att-person" value={person} onChange={e => setPerson(e.target.value)} className={dateInput}>
            <option value="ALL">Everyone</option>
            {people.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </div>
      </div>

      <Notice notice={notice} />

      {/* Per-person summary */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><h3 className="font-black text-slate-900">Summary</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-50">
                <th className="text-left px-5 py-2">Staff</th>
                <th className="text-right px-5 py-2">Worked</th>
                <th className="text-right px-5 py-2">Shifts done</th>
                <th className="text-right px-5 py-2">Absent</th>
                <th className="text-right px-5 py-2">Late</th>
                <th className="text-right px-5 py-2">Auto clock-out</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(r => (
                <tr key={r.name} className="border-b border-slate-50">
                  <td className="px-5 py-2"><span className="font-bold text-slate-900">{r.name}</span> <span className="text-xs text-slate-500">· {roleLabel(r.role)}</span></td>
                  <td className="px-5 py-2 text-right tabular-nums font-bold">{r.worked.toFixed(1)} h</td>
                  <td className="px-5 py-2 text-right tabular-nums">{r.completed}</td>
                  <td className={`px-5 py-2 text-right tabular-nums ${r.absent ? "text-red-700 font-bold" : ""}`}>{r.absent}</td>
                  <td className={`px-5 py-2 text-right tabular-nums ${r.late ? "text-orange-800 font-bold" : ""}`}>{r.late}</td>
                  <td className={`px-5 py-2 text-right tabular-nums ${r.flagged ? "text-orange-800 font-bold" : ""}`}>{r.flagged}</td>
                </tr>
              ))}
              {summary.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-500">No shifts in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ledger */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><h3 className="font-black text-slate-900">Shifts</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-50">
                <th className="text-left px-5 py-2">Date</th>
                <th className="text-left px-5 py-2">Staff</th>
                <th className="text-left px-5 py-2">Status</th>
                <th className="text-left px-5 py-2">In – Out</th>
                <th className="text-right px-5 py-2">Hours</th>
                <th className="text-left px-5 py-2">Notes</th>
                <th className="text-right px-5 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(s => (
                <tr key={s.shiftId} className="border-b border-slate-50 align-top">
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    <p className="font-bold text-slate-900">{fmtDay(s.shiftDate)}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{s.shiftType}</p>
                    {s.expectedStart && s.scheduledStart && s.expectedStart > s.scheduledStart && (
                      <p className="text-[11px] text-slate-500">Added at {fmtTime(s.expectedStart)}</p>
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    <p className="font-bold text-slate-900">{s.staffName}</p>
                    {s.assignment && <p className="text-xs text-slate-500">{s.assignment}</p>}
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    <StatusBadge status={s.status} />
                    {s.late && <p className="text-xs font-bold text-orange-800 mt-1">{s.lateMinutes} min late</p>}
                    {s.autoClosed && <p className="text-xs font-bold text-orange-800 mt-1">Auto clock-out</p>}
                  </td>
                  <td className="px-5 py-2.5 tabular-nums whitespace-nowrap text-slate-700">{fmtTime(s.clockInAt)} – {fmtTime(s.clockOutAt)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-bold">{s.workedHours != null ? `${s.workedHours} h` : "—"}</td>
                  <td className="px-5 py-2.5 text-xs text-slate-600 max-w-[260px] whitespace-pre-line">{s.notes || ""}</td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    {canManage && ["SCHEDULED", "CONFIRMED"].includes(s.status) && (
                      <button onClick={() => markAbsent(s)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-700 hover:bg-red-50">Absent</button>
                    )}
                    {canManage && s.status !== "CANCELLED" && (
                      <button onClick={() => setCorrecting(s)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100">Correct</button>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-slate-500">No shifts in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {correcting && (
        <AttendanceDialog shift={correcting} onClose={() => setCorrecting(null)}
          onSaved={msg => { setCorrecting(null); setNotice({ type: "ok", text: msg }); load(); }} />
      )}
    </div>
  );
}
