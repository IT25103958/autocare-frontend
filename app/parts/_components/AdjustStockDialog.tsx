"use client";

import { useState } from "react";
import api from "../../../utils/axiosInstance";
import { InventoryPart, errText } from "./inventory";

const REASONS = ["Monthly stock count", "Damaged in storage", "Found misplaced stock", "Data entry correction"];

// Physical stock count: enter what's actually on the shelf; the difference is
// recorded as an adjustment with a reason.
export default function AdjustStockDialog({ part, onClose, onSaved }: {
  part: InventoryPart;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [counted, setCounted] = useState<string>(String(part.currentStock));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const countedNum = Number(counted);
  const delta = Number.isFinite(countedNum) ? countedNum - part.currentStock : 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.put(`/parts/${part.partID}/adjust`, { countedQuantity: countedNum, reason });
      onSaved(`${part.name}: stock set to ${countedNum} (${delta > 0 ? "+" : ""}${delta}).`);
    } catch (err) {
      setError(errText(err, "Couldn't adjust the stock."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center-safe justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="adjust-title">
      <form onSubmit={save} className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-md w-full border border-slate-200 space-y-4">
        <div>
          <h3 id="adjust-title" className="text-xl font-black text-slate-900">Adjust Stock</h3>
          <p className="text-sm text-slate-500 mt-1"><span className="font-mono">{part.partCode}</span> · {part.name} · system stock <span className="font-bold text-slate-800">{part.currentStock}</span></p>
        </div>
        <div>
          <label htmlFor="adj-count" className="block text-xs font-black text-slate-600 uppercase tracking-widest mb-2">Counted on the shelf</label>
          <input id="adj-count" type="number" min={0} value={counted} onChange={e => setCounted(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-black text-lg tabular-nums outline-none focus:border-blue-500" />
          {delta !== 0 && <p className={`text-xs font-bold mt-1.5 ${delta > 0 ? "text-emerald-700" : "text-red-700"}`}>{delta > 0 ? `+${delta}` : delta} units will be recorded</p>}
        </div>
        <div>
          <label htmlFor="adj-reason" className="block text-xs font-black text-slate-600 uppercase tracking-widest mb-2">Reason</label>
          <input id="adj-reason" list="adj-reasons" value={reason} maxLength={300} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Monthly stock count" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-500" />
          <datalist id="adj-reasons">{REASONS.map(r => <option key={r} value={r} />)}</datalist>
        </div>
        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving || delta === 0 || countedNum < 0 || reason.trim().length < 5}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Saving..." : "Record Adjustment"}
          </button>
        </div>
      </form>
    </div>
  );
}
