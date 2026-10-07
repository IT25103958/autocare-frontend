"use client";

import { useEffect, useMemo, useState } from "react";
import api from "../../../utils/axiosInstance";
import ShiftDialog, { ShiftDraft } from "./ShiftDialog";
import {
  BLOCK_LABEL, BLOCK_SHORT, Leave, Notice, Resources, Shift, StaffMember,
  addDays, errorText, fmtDay, isoDate, mondayOf, roleLabel, shiftChipClass,
} from "./roster";

interface WeekData {
  weekStart: string;
  weekEnd: string;
  shifts: Shift[];
  leave: Leave[];
  coverageGaps: { date: string; block: string; role: string; have: number; need: number }[];
  plannedHours: Record<string, number>;
}

const EDITABLE = ["SCHEDULED", "CONFIRMED"];

// Staff x day grid for one week. Click an empty cell to schedule, a shift to edit.
export default function WeekPlanner({ staff, resources, canManage }: {
  staff: StaffMember[];
  resources: Resources | null;
  canManage: boolean;
}) {
  const today = isoDate(new Date());
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [data, setData] = useState<WeekData | null>(null);
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [dialog, setDialog] = useState<{ draft: ShiftDraft; editing: Shift | null } | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [copying, setCopying] = useState(false);

  const load = () => {
    api.get<WeekData>("/roster/week", { params: { start: weekStart } })
      .then(res => setData(res.data))
      .catch(err => setNotice({ type: "error", text: errorText(err, "Couldn't load the week.") }));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the week changes
  useEffect(() => { load(); }, [weekStart]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Planner rows: everyone the manager can schedule, plus anyone already on this week's roster.
  const rows = useMemo(() => {
    const byUser = new Map(staff.map(s => [s.username, s]));
    data?.shifts.forEach(s => {
      const key = s.staffUsername || s.staffName;
      if (!byUser.has(key)) byUser.set(key, { username: key, fullName: s.staffName, role: s.role });
    });
    return Array.from(byUser.values())
      .filter(s => roleFilter === "ALL" || s.role === roleFilter)
      .sort((a, b) => a.role.localeCompare(b.role) || a.fullName.localeCompare(b.fullName));
  }, [staff, data, roleFilter]);

  const roles = Array.from(new Set(staff.map(s => s.role))).sort();

  const shiftsFor = (username: string, day: string) =>
    data?.shifts.filter(s => (s.staffUsername || s.staffName) === username && s.shiftDate === day) ?? [];
  const leaveFor = (username: string, day: string) =>
    data?.leave.find(l => l.staffUsername === username && l.fromDate <= day && l.toDate >= day);
  const gapsOn = (day: string) => data?.coverageGaps.filter(g => g.date === day) ?? [];

  const openNew = (username: string, day: string) => setDialog({
    draft: { staffUsername: username, shiftDate: day, shiftType: "MORNING", assignment: "", notes: "" },
    editing: null,
  });

  const openEdit = (s: Shift) => setDialog({
    draft: { staffUsername: s.staffUsername || "", shiftDate: s.shiftDate, shiftType: s.shiftType, assignment: s.assignment || "", notes: s.notes || "" },
    editing: s,
  });

  const deleteShift = async (s: Shift) => {
    if (!confirm(`Delete ${s.staffName}'s ${s.shiftType.toLowerCase()} shift on ${fmtDay(s.shiftDate)}?`)) return;
    try {
      await api.delete(`/roster/${s.shiftId}`);
      setDialog(null);
      setNotice({ type: "ok", text: "Shift deleted." });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't delete the shift.") });
    }
  };

  const copyPreviousWeek = async () => {
    if (!confirm(`Copy every shift from the week of ${fmtDay(addDays(weekStart, -7))} into this week? Clashes are skipped.`)) return;
    setCopying(true);
    try {
      const res = await api.post<{ created: number; skipped: number; skippedDetails: string[] }>("/roster/copy-week", {
        fromWeek: addDays(weekStart, -7), toWeek: weekStart,
      });
      const r = res.data;
      setNotice({
        type: "ok",
        text: `Copied ${r.created} shifts.` + (r.skipped ? ` Skipped ${r.skipped}: ${r.skippedDetails.slice(0, 3).join("; ")}${r.skipped > 3 ? "…" : ""}` : ""),
      });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't copy the week.") });
    } finally {
      setCopying(false);
    }
  };

  const totalGaps = data?.coverageGaps.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold hover:bg-slate-50" aria-label="Previous week">←</button>
          <p className="text-sm font-black text-slate-900 min-w-[190px] text-center">{fmtDay(weekStart)} – {fmtDay(addDays(weekStart, 6))}</p>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold hover:bg-slate-50" aria-label="Next week">→</button>
          {weekStart !== mondayOf(today) && (
            <button onClick={() => setWeekStart(mondayOf(today))} className="px-3 py-2 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-50">This week</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Filter by role"
            className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-blue-500">
            <option value="ALL">All roles</option>
            {roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          {canManage && (
            <button onClick={copyPreviousWeek} disabled={copying} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {copying ? "Copying..." : "Copy previous week"}
            </button>
          )}
        </div>
      </div>

      <Notice notice={notice} />

      {/* Grid */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 w-52">Staff</th>
                {days.map(d => {
                  const gaps = gapsOn(d);
                  return (
                    <th key={d} className={`px-2 py-3 text-center ${d === today ? "bg-blue-50" : ""}`}>
                      <p className={`text-xs font-black ${d === today ? "text-blue-700" : "text-slate-700"}`}>{fmtDay(d)}</p>
                      {gaps.length > 0 ? (
                        <p className="text-[10px] font-bold text-red-700 mt-0.5" title={gaps.map(g => `${g.block} ${roleLabel(g.role)} ${g.have}/${g.need}`).join("\n")}>
                          ⚠ {gaps.length} gap{gaps.length > 1 ? "s" : ""}
                        </p>
                      ) : (
                        <p className="text-[10px] font-bold text-emerald-700 mt-0.5">Covered</p>
                      )}
                    </th>
                  );
                })}
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(person => (
                <tr key={person.username} className="border-b border-slate-50 align-top">
                  <td className="px-4 py-2">
                    <p className="font-bold text-slate-900 leading-tight">{person.fullName}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{roleLabel(person.role)}</p>
                  </td>
                  {days.map(d => {
                    const cellShifts = shiftsFor(person.username, d);
                    const leave = leaveFor(person.username, d);
                    return (
                      <td key={d} className={`px-1.5 py-1.5 ${d === today ? "bg-blue-50/40" : ""}`}>
                        <div className="space-y-1 min-h-[44px]">
                          {leave && (
                            <div className="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-amber-50 text-amber-800 border border-amber-200 text-center">On leave</div>
                          )}
                          {cellShifts.map(s => (
                            <button key={s.shiftId}
                              onClick={() => canManage && EDITABLE.includes(s.status) ? openEdit(s) : undefined}
                              title={`${BLOCK_LABEL[s.shiftType]}${s.assignment ? " · " + s.assignment : ""} · ${s.status}${s.notes ? "\n" + s.notes : ""}`}
                              className={`w-full text-left px-2 py-1 rounded-md border text-[11px] font-bold ${shiftChipClass(s.status)} ${canManage && EDITABLE.includes(s.status) ? "hover:ring-2 hover:ring-blue-300" : "cursor-default"}`}>
                              <span className="font-black">{BLOCK_SHORT[s.shiftType]}</span>
                              {s.assignment && <span className="block truncate text-[10px] font-medium">{s.assignment.replace(/ - .*/, "")}</span>}
                            </button>
                          ))}
                          {canManage && cellShifts.every(s => s.status === "CANCELLED") && !leave && d >= today && (
                            <button onClick={() => openNew(person.username, d)} aria-label={`Add shift for ${person.fullName} on ${fmtDay(d)}`}
                              className="w-full py-1 rounded-md border border-dashed border-slate-200 text-slate-400 hover:text-blue-700 hover:border-blue-300 text-xs font-bold">
                              +
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-700">{data?.plannedHours[person.username] ?? 0}h</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-slate-500">No staff to show.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend + coverage */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-600">
        <span>AM = Morning 08–16 · PM = Afternoon 16–00 · NT = Night 00–08</span>
        {["SCHEDULED", "CONFIRMED", "CHECKED_IN", "COMPLETED", "ABSENT"].map(s => (
          <span key={s} className={`px-2 py-0.5 rounded-md border ${shiftChipClass(s)}`}>{s === "CHECKED_IN" ? "On duty" : s.charAt(0) + s.slice(1).toLowerCase()}</span>
        ))}
      </div>

      {totalGaps > 0 && (
        <div className="bg-white rounded-3xl border border-red-200 p-5">
          <h3 className="text-sm font-black text-red-800 mb-2">Coverage gaps this week ({totalGaps})</h3>
          <p className="text-xs text-slate-600 mb-3">
            Minimum per shift: {resources ? Object.entries(resources.minCoverage).map(([r, n]) => `${n} ${roleLabel(r)}`).join(", ") : "—"}.
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {data!.coverageGaps.map((g, i) => (
              <li key={i} className="text-xs text-slate-700 px-3 py-2 rounded-lg bg-red-50/60 border border-red-100">
                <span className="font-bold">{fmtDay(g.date)} · {g.block.toLowerCase()}</span> — {roleLabel(g.role)} {g.have}/{g.need}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dialog && (
        <ShiftDialog draft={dialog.draft} editing={dialog.editing} staff={staff} resources={resources}
          onClose={() => setDialog(null)}
          onSaved={msg => { setDialog(null); setNotice({ type: "ok", text: msg }); load(); }}
          onDelete={deleteShift} />
      )}
    </div>
  );
}
