"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { Leave, Notice, errorText, fmtDay, roleLabel } from "./roster";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-800 border-yellow-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-slate-50 text-slate-500 border-slate-200",
};

export function LeaveStatus({ status }: { status: string }) {
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${STATUS_STYLE[status]}`}>{status}</span>;
}

// Managers approve or reject leave for the roles they roster. Approving cancels
// the person's upcoming shifts in that period.
export default function LeaveReview({ onChanged }: { onChanged?: () => void }) {
  const [requests, setRequests] = useState<Leave[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const load = () => {
    api.get<Leave[]>("/roster/leave")
      .then(res => setRequests(res.data))
      .catch(err => setNotice({ type: "error", text: errorText(err, "Couldn't load leave requests.") }));
  };

  useEffect(() => { load(); }, []);

  const approve = async (l: Leave) => {
    const note = prompt(`Approve ${l.staffName}'s leave (${fmtDay(l.fromDate)} – ${fmtDay(l.toDate)})? Any shifts in that period will be cancelled.\nOptional note:`);
    if (note === null) return;
    try {
      const res = await api.put<{ shiftsCancelled: number; jobsReleased?: string[] }>(`/roster/leave/${l.leaveId}/approve`, { note });
      const jobs = res.data.jobsReleased ?? [];
      setNotice({ type: "ok", text: `Approved. ${res.data.shiftsCancelled} shift(s) cancelled — check the week planner for coverage gaps.`
        + (jobs.length ? ` ${jobs.length} workshop job(s) went back to Job Cards to be reassigned: ${jobs.join(", ")}.` : "") });
      load();
      onChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't approve.") });
    }
  };

  const reject = async (l: Leave) => {
    const note = prompt(`Reason for rejecting ${l.staffName}'s leave:`);
    if (note === null) return;
    try {
      await api.put(`/roster/leave/${l.leaveId}/reject`, { note });
      setNotice({ type: "ok", text: "Request rejected. The staff member has been emailed." });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't reject.") });
    }
  };

  const pending = requests.filter(r => r.status === "PENDING");
  const visible = showAll ? requests : pending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{pending.length} request{pending.length === 1 ? "" : "s"} waiting for review</p>
        <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="w-4 h-4" />
          Show history
        </label>
      </div>
      <Notice notice={notice} />
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3">Staff</th>
                <th className="text-left px-5 py-3">Dates</th>
                <th className="text-left px-5 py-3">Reason</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-right px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(l => (
                <tr key={l.leaveId} className="border-b border-slate-50 align-top">
                  <td className="px-5 py-3">
                    <p className="font-bold text-slate-900">{l.staffName}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{roleLabel(l.role)}</p>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <p className="font-bold text-slate-900">{fmtDay(l.fromDate)} – {fmtDay(l.toDate)}</p>
                    <p className="text-xs text-slate-500">{l.days} day{l.days === 1 ? "" : "s"}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-700 max-w-[320px]">{l.reason}</td>
                  <td className="px-5 py-3">
                    <LeaveStatus status={l.status} />
                    {l.reviewedBy && <p className="text-xs text-slate-500 mt-1">by {l.reviewedBy}{l.reviewNote ? `: ${l.reviewNote}` : ""}</p>}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {l.status === "PENDING" && (
                      <>
                        <button onClick={() => approve(l)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700">Approve</button>
                        <button onClick={() => reject(l)} className="ml-2 px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 hover:bg-red-50">Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-500">{showAll ? "No leave requests yet." : "No pending requests."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
