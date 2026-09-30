"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { ChangeBadge, InventoryPart, MOVEMENT_LABEL, StockMovement, fmtWhen } from "./inventory";

// Every stock change for one part, newest first — explains the current stock.
export default function StockHistoryDrawer({ part, onClose }: { part: InventoryPart; onClose: () => void }) {
  const [rows, setRows] = useState<StockMovement[] | null>(null);

  useEffect(() => {
    api.get<StockMovement[]>(`/parts/${part.partID}/movements`).then(res => setRows(res.data)).catch(() => setRows([]));
  }, [part.partID]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="history-title" className="w-full max-w-lg h-full bg-white shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 id="history-title" className="text-lg font-black text-slate-900">Stock History</h2>
            <p className="text-xs text-slate-500"><span className="font-mono">{part.partCode}</span> · {part.name} · <span className="font-bold text-slate-700">{part.currentStock} in stock</span></p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button>
        </div>
        <div className="p-6">
          {rows === null ? <p className="text-sm text-slate-500">Loading...</p> : rows.length === 0 ? (
            <p className="text-sm text-slate-500">No recorded movements yet. Movements are tracked from this version onwards.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
                  <th className="text-left py-2">When / what</th>
                  <th className="text-right py-2">Change</th>
                  <th className="text-right py-2">After</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(m => (
                  <tr key={m.movementId} className="border-b border-slate-50 align-top">
                    <td className="py-2.5 pr-3">
                      <p className="font-bold text-slate-900">{MOVEMENT_LABEL[m.type] || m.type}{m.reference && <span className="font-mono text-xs text-blue-700 ml-2">{m.reference}</span>}</p>
                      <p className="text-xs text-slate-500">{fmtWhen(m.createdAt)} · {m.performedBy}</p>
                      {m.reason && <p className="text-xs text-slate-600 mt-0.5">{m.reason}</p>}
                    </td>
                    <td className="py-2.5 text-right"><ChangeBadge change={m.quantityChange} /></td>
                    <td className="py-2.5 text-right tabular-nums text-slate-700">{m.stockAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </div>
  );
}
