"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import AttendanceDialog from "./AttendanceDialog";
import { BLOCKS, BLOCK_LABEL, Leave, Notice, Shift, errorText, fmtDay, fmtTime, roleLabel } from "./roster";

interface TodayData {
  date: string;
  currentBlock: string;
  shifts: { shift: Shift; liveState: string }[];
  counts: Record<string, number>;
  onLeave: Leave[];
}

const STATE: Record<string, { label: string; style: string }> = {
  ON_DUTY: { label: "On duty", style: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ON_DUTY_LATE: { label: "On duty · late", style: "bg-orange-50 text-orange-800 border-orange-200" },
  DUE_NOW: { label: "Due now", style: "bg-blue-50 text-blue-700 border-blue-200" },
  NOT_ARRIVED: { label: "Not arrived", style: "bg-red-50 text-red-700 border-red-200" },
  UPCOMING: { label: "Upcoming", style: "bg-slate-50 text-slate-600 border-slate-200" },
  FINISHED: { label: "Finished", style: "bg-slate-50 text-slate-600 border-slate-200" },
  ABSENT: { label: "Absent", style: "bg-red-50 text-red-700 border-red-200" },
  CANCELLED: { label: "Cancelled", style: "bg-slate-50 text-slate-500 border-slate-200" },
};

// Live view of today's floor: who is on duty, late, missing or on leave.
export default function TodayBoard({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<TodayData | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [correcting, setCorrecting] = useState<Shift | null>(null);

  const load = () => {
    api.get<TodayData>("/roster/today")
      .then(res => setData(res.data))
      .catch(err => setNotice({ type: "error", text: errorText(err, "Couldn't load today's roster.") }));
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000); // keep the board live
    return () => clearInterval(timer);
  }, []);

  const markAbsent = async (s: Shift) => {
    const reason = prompt(`Mark ${s.staffName} absent? Optional reason:`);
    if (reason === null) return;
    try {
      await api.put(`/roster/${s.shiftId}/absent`, { reason });
      setNotice({ type: "ok", text: `${s.staffName} marked absent.` });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't mark absent.") });
    }
  };

  if (!data) return <Notice notice={notice} />;

  const c = (k: string) => data.counts[k] ?? 0;
  const tiles: [string, number, string][] = [
    ["On duty", c("ON_DUTY") + c("ON_DUTY_LATE"), c("ON_DUTY_LATE") ? `${c("ON_DUTY_LATE")} arrived late` : "All on time"],
    ["Not arrived", c("NOT_ARRIVED") + c("DUE_NOW"), "Past start, not clocked in"],
    ["Upcoming", c("UPCOMING"), "Later today"],
    ["Absent", c("ABSENT"), "No-shows today"],
    ["On leave", data.onLeave.length, "Approved leave"],
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{fmtDay(data.date)} · current block: <span className="font-bold text-slate-800">{BLOCK_LABEL[data.currentBlock]}</span> · refreshes every minute</p>
      <Notice notice={notice} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</h3>
            <div className={`text-3xl font-black tabular-nums ${label === "Not arrived" && value > 0 ? "text-red-700" : "text-slate-900"}`}>{value}</div>
            <p className="text-xs font-bold text-slate-500 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {BLOCKS.map(block => {
        const rows = data.shifts.filter(r => r.shift.shiftType === block);
        if (rows.length === 0) return null;
        return (
          <div key={block} className={`bg-white rounded-3xl border shadow-sm overflow-hidden ${block === data.currentBlock ? "border-blue-300" : "border-slate-200"}`}>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-900">{BLOCK_LABEL[block]}</h3>
              {block === data.currentBlock && <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">Now</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-50">
                    <th className="text-left px-5 py-2">Staff</th>
                    <th className="text-left px-5 py-2">Allocation</th>
                    <th className="text-left px-5 py-2">State</th>
                    <th className="text-left px-5 py-2">Clock in / out</th>
                    <th className="text-right px-5 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ shift: s, liveState }) => (
                    <tr key={s.shiftId} className="border-b border-slate-50">
                      <td className="px-5 py-2.5">
                        <p className="font-bold text-slate-900">{s.staffName}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{roleLabel(s.role)}</p>
                      </td>
                      <td className="px-5 py-2.5 text-slate-700">{s.assignment || "—"}</td>
                      <td className="px-5 py-2.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${STATE[liveState]?.style}`}>{STATE[liveState]?.label || liveState}</span>
                        {s.late && <span className="ml-2 text-xs text-orange-800 font-bold">{s.lateMinutes} min late</span>}
                      </td>
                      <td className="px-5 py-2.5 tabular-nums text-slate-700">{fmtTime(s.clockInAt)} – {fmtTime(s.clockOutAt)}</td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        {canManage && (liveState === "NOT_ARRIVED" || liveState === "DUE_NOW") && (
                          <button onClick={() => markAbsent(s)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 hover:bg-red-50">Mark absent</button>
                        )}
                        {canManage && ["NOT_ARRIVED", "ON_DUTY", "ON_DUTY_LATE", "FINISHED", "ABSENT"].includes(liveState) && (
                          <button onClick={() => setCorrecting(s)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100">Correct</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {data.shifts.length === 0 && <p className="text-center py-10 text-slate-500 bg-white rounded-3xl border border-slate-200">Nobody is rostered today.</p>}

      {data.onLeave.length > 0 && (
        <div className="bg-white rounded-3xl border border-amber-200 p-5">
          <h3 className="text-sm font-black text-amber-900 mb-2">On leave today</h3>
          <ul className="text-sm text-slate-700 space-y-1">
            {data.onLeave.map(l => <li key={l.leaveId}><span className="font-bold">{l.staffName}</span> ({roleLabel(l.role)}) — until {fmtDay(l.toDate)}</li>)}
          </ul>
        </div>
      )}

      {correcting && (
        <AttendanceDialog shift={correcting} onClose={() => setCorrecting(null)}
          onSaved={msg => { setCorrecting(null); setNotice({ type: "ok", text: msg }); load(); }} />
      )}
    </div>
  );
}
