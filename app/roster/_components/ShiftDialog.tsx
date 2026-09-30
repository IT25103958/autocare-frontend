"use client";

import { useState } from "react";
import api from "../../../utils/axiosInstance";
import { BLOCKS, BLOCK_LABEL, Resources, Shift, StaffMember, errorText, inputClass, roleLabel } from "./roster";

export interface ShiftDraft {
  staffUsername: string;
  shiftDate: string;
  shiftType: string;
  assignment: string;
  notes: string;
}

// Create or edit a shift. The bay/pump picker follows the selected person's role;
// clashes (double booking, leave, bay/pump taken) come back from the server.
export default function ShiftDialog({ draft, editing, staff, resources, onClose, onSaved, onDelete }: {
  draft: ShiftDraft;
  editing: Shift | null;
  staff: StaffMember[];
  resources: Resources | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onDelete?: (shift: Shift) => void;
}) {
  const [form, setForm] = useState<ShiftDraft>(draft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const person = staff.find(s => s.username === form.staffUsername);
  const options = person?.role === "TECHNICIAN" ? resources?.bays ?? []
    : person?.role === "FUEL_ATTENDANT" ? resources?.pumps ?? [] : [];
  const assignmentLabel = person?.role === "TECHNICIAN" ? "Service bay" : "Pump";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = { ...form, assignment: options.length ? form.assignment : "" };
    try {
      if (editing) await api.put(`/roster/${editing.shiftId}`, payload);
      else await api.post("/roster/assign", payload);
      onSaved(editing ? "Shift updated — the staff member will need to acknowledge it again." : `Shift scheduled for ${person?.fullName}.`);
    } catch (err) {
      setError(errorText(err, "Couldn't save the shift."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="shift-dialog-title">
      <form onSubmit={save} className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-lg w-full border border-slate-200 space-y-4">
        <h3 id="shift-dialog-title" className="text-xl font-black text-slate-900">{editing ? "Edit Shift" : "Schedule a Shift"}</h3>

        <div>
          <label htmlFor="sd-staff" className="block text-xs font-bold text-slate-700 mb-1">Staff member</label>
          <select id="sd-staff" value={form.staffUsername} onChange={e => setForm({ ...form, staffUsername: e.target.value, assignment: "" })} className={inputClass} required>
            <option value="">Select staff...</option>
            {staff.map(s => <option key={s.username} value={s.username}>{s.fullName} — {roleLabel(s.role)}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sd-date" className="block text-xs font-bold text-slate-700 mb-1">Date</label>
            <input id="sd-date" type="date" value={form.shiftDate} onChange={e => setForm({ ...form, shiftDate: e.target.value })} className={inputClass} required />
          </div>
          <div>
            <label htmlFor="sd-block" className="block text-xs font-bold text-slate-700 mb-1">Shift block</label>
            <select id="sd-block" value={form.shiftType} onChange={e => setForm({ ...form, shiftType: e.target.value })} className={inputClass}>
              {BLOCKS.map(b => <option key={b} value={b}>{BLOCK_LABEL[b]}</option>)}
            </select>
          </div>
        </div>

        {options.length > 0 && (
          <div>
            <label htmlFor="sd-assignment" className="block text-xs font-bold text-slate-700 mb-1">{assignmentLabel} <span className="font-medium text-slate-500">(optional)</span></label>
            <select id="sd-assignment" value={form.assignment} onChange={e => setForm({ ...form, assignment: e.target.value })} className={inputClass}>
              <option value="">Not allocated</option>
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="sd-notes" className="block text-xs font-bold text-slate-700 mb-1">Notes <span className="font-medium text-slate-500">(optional)</span></label>
          <input id="sd-notes" value={form.notes} maxLength={500} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputClass} />
        </div>

        {error && <p className="text-sm font-bold text-red-600">{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-2">
          <div>
            {editing && onDelete && (
              <button type="button" onClick={() => onDelete(editing)} className="px-3 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50">Delete shift</button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={saving || !form.staffUsername || !form.shiftDate} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving..." : editing ? "Save Changes" : "Schedule"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
