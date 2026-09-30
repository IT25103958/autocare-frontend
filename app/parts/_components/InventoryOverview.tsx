"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { ChangeBadge, InventoryPart, InventorySummary, LowStockRow, MOVEMENT_LABEL, StockMovement, fmtWhen, lkr } from "./inventory";

// Inventory report strip, low-stock reorder list, most-used parts and the
// recent stock ledger. refreshKey changes whenever the page saves something.
export default function InventoryOverview({ refreshKey, onReorder, onShowHistory }: {
  refreshKey: number;
  onReorder: (part: InventoryPart, quantity: number) => void;
  onShowHistory: (part: InventoryPart) => void;
}) {
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [low, setLow] = useState<LowStockRow[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [showLedger, setShowLedger] = useState(false);

  useEffect(() => {
    api.get<InventorySummary>("/parts/summary").then(res => setSummary(res.data)).catch(() => setSummary(null));
    api.get<LowStockRow[]>("/parts/low-stock").then(res => setLow(res.data)).catch(() => setLow([]));
    if (showLedger) api.get<StockMovement[]>("/parts/movements").then(res => setMovements(res.data)).catch(() => setMovements([]));
  }, [refreshKey, showLedger]);

  if (!summary) return null;

  const tiles: [string, string, string, boolean?][] = [
    ["Active parts", summary.activeParts.toLocaleString(), `${summary.totalUnits.toLocaleString()} units on hand`],
    ["Stock value (cost)", lkr(summary.stockValueAtCost), summary.partsMissingCost ? `${summary.partsMissingCost} part(s) have no cost recorded` : "What the stock cost us"],
    ["Stock value (retail)", lkr(summary.stockValueAtRetail), "At current selling prices"],
    ["Low stock", String(summary.lowStock), "At or below minimum", summary.lowStock > 0],
    ["Out of stock", String(summary.outOfStock), "Can't be used or sold", summary.outOfStock > 0],
  ];

  return (
    <div className="space-y-6 mb-8">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {tiles.map(([label, value, sub, alert]) => (
          <div key={label} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{label}</h3>
            <div className={`text-2xl font-black tabular-nums ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</div>
            <p className="text-xs font-bold text-slate-500 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LOW STOCK / REORDER */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-black text-slate-900">Needs Reordering</h3>
            <span className="text-xs text-slate-500">Inventory managers are emailed when a part hits its minimum, plus a daily digest.</span>
          </div>
          {low.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-500">All parts are above their minimum stock level.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-50">
                    <th className="text-left px-6 py-2">Part</th>
                    <th className="text-right px-4 py-2">Stock / min</th>
                    <th className="text-right px-4 py-2">On order</th>
                    <th className="text-right px-4 py-2">Suggested</th>
                    <th className="text-right px-6 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {low.map(r => (
                    <tr key={r.part.partID} className="border-b border-slate-50">
                      <td className="px-6 py-2.5">
                        <button onClick={() => onShowHistory(r.part)} className="font-bold text-slate-900 hover:text-blue-700 text-left">{r.part.name}</button>
                        <p className="text-[10px] font-mono text-slate-500">{r.part.partCode}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={`font-black ${r.outOfStock ? "text-red-700" : "text-orange-700"}`}>{r.part.currentStock}</span>
                        <span className="text-slate-500"> / {r.part.minimumStockLevel}</span>
                        {r.outOfStock && <p className="text-[10px] font-black uppercase tracking-widest text-red-700">Out of stock</p>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.onOrder || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold">{r.suggestedOrder || "—"}</td>
                      <td className="px-6 py-2.5 text-right">
                        {r.suggestedOrder > 0 ? (
                          <button onClick={() => onReorder(r.part, r.suggestedOrder)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 whitespace-nowrap">Reorder</button>
                        ) : (
                          <span className="text-xs font-bold text-emerald-700">Covered by open order</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* TOP USED */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-black text-slate-900 mb-1">Most Used (30 days)</h3>
          <p className="text-xs text-slate-500 mb-3">Workshop jobs + counter sales</p>
          {summary.topUsedLast30Days.length === 0 ? <p className="text-sm text-slate-500">No usage recorded yet.</p> : (
            <ol className="space-y-2">
              {summary.topUsedLast30Days.map((t, i) => (
                <li key={t.partId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-700"><span className="text-slate-400 tabular-nums mr-2">{i + 1}.</span>{t.partName}</span>
                  <span className="font-black tabular-nums text-slate-900">{t.quantity}</span>
                </li>
              ))}
            </ol>
          )}
          {Object.keys(summary.movementsLast30Days).length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-1">
              {Object.entries(summary.movementsLast30Days).map(([type, qty]) => (
                <p key={type} className="text-xs text-slate-600 flex justify-between"><span>{MOVEMENT_LABEL[type] || type}</span><span className="font-bold tabular-nums">{qty} units</span></p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RECENT LEDGER */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <button onClick={() => setShowLedger(v => !v)} aria-expanded={showLedger} className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50">
          <span className="font-black text-slate-900">Recent Stock Movements</span>
          <span className="text-xs font-bold text-blue-700">{showLedger ? "Hide" : "Show last 100"}</span>
        </button>
        {showLedger && (
          <div className="overflow-x-auto border-t border-slate-100 max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
                  <th className="text-left px-6 py-2">When</th>
                  <th className="text-left px-4 py-2">Part</th>
                  <th className="text-left px-4 py-2">Movement</th>
                  <th className="text-left px-4 py-2">By</th>
                  <th className="text-right px-4 py-2">Change</th>
                  <th className="text-right px-6 py-2">After</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.movementId} className="border-b border-slate-50">
                    <td className="px-6 py-2 text-slate-500 whitespace-nowrap">{fmtWhen(m.createdAt)}</td>
                    <td className="px-4 py-2"><span className="font-bold text-slate-900">{m.partName}</span> <span className="font-mono text-[10px] text-slate-500">{m.partCode}</span></td>
                    <td className="px-4 py-2 text-slate-700">{MOVEMENT_LABEL[m.type] || m.type}{m.reference && <span className="font-mono text-xs text-blue-700 ml-2">{m.reference}</span>}{m.reason && <span className="block text-xs text-slate-500">{m.reason}</span>}</td>
                    <td className="px-4 py-2 text-slate-500">{m.performedBy}</td>
                    <td className="px-4 py-2 text-right"><ChangeBadge change={m.quantityChange} /></td>
                    <td className="px-6 py-2 text-right tabular-nums">{m.stockAfter}</td>
                  </tr>
                ))}
                {movements.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No movements recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
