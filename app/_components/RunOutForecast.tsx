"use client";

import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";

export interface Forecast {
  key: string;
  name: string;
  unit: string;
  stock: number;
  dailyUsage: number;
  daysLeft: number | null;
  runsOutOn: string | null;
  leadTimeDays: number;
  leadTimeSource: string;
  orderBy: string | null;
  onOrder: number;
  suggestedOrder: number;
  status: "ORDER_NOW" | "ORDER_SOON" | "ON_ORDER" | "OK" | "NO_USAGE";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  daysOfHistory: number;
}

const STATUS: Record<Forecast["status"], { label: string; badge: string }> = {
  ORDER_NOW: { label: "Order now", badge: "bg-red-600 text-white" },
  ORDER_SOON: { label: "Order soon", badge: "bg-amber-500 text-white" },
  ON_ORDER: { label: "On order", badge: "bg-blue-100 text-blue-800" },
  OK: { label: "OK", badge: "bg-emerald-100 text-emerald-800" },
  NO_USAGE: { label: "Not used", badge: "bg-slate-100 text-slate-600" },
};

const ACTIONABLE: Forecast["status"][] = ["ORDER_NOW", "ORDER_SOON", "ON_ORDER"];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function fmtQty(n: number, unit: string) {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: unit === "litres" ? 0 : 1 })}${unit === "litres" ? " L" : ""}`;
}

// Predicted run-out dates from recent usage and supplier delivery times
// (StockForecastService). Lists what needs action first; the rest on request.
export default function RunOutForecast({ endpoint, title, refreshKey = 0, onOrder, orderLabel = "Order" }: {
  endpoint: string;
  title: string;
  refreshKey?: number;
  onOrder?: (row: Forecast) => void;
  orderLabel?: string;
}) {
  const [rows, setRows] = useState<Forecast[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.get<Forecast[]>(endpoint)
      .then(res => { setRows(res.data); setFailed(false); })
      .catch(() => setFailed(true));
  }, [endpoint, refreshKey]);

  if (failed) return null; // a forecast is a helper; the page works without it

  const actionable = (rows ?? []).filter(r => ACTIONABLE.includes(r.status));
  const visible = showAll ? rows ?? [] : actionable;

  return (
    <section aria-labelledby={`${endpoint}-title`} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id={`${endpoint}-title`} className="font-black text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">Predicted from the last 30 days of use (recent days count more) and how long deliveries take.</p>
        </div>
        {rows && rows.length > actionable.length && (
          <button onClick={() => setShowAll(v => !v)} className="text-xs font-bold text-blue-700 hover:underline">
            {showAll ? "Show only what needs action" : `Show all ${rows.length}`}
          </button>
        )}
      </div>

      {rows === null && <div className="m-6 h-12 rounded-2xl bg-slate-100 animate-pulse" />}
      {rows && visible.length === 0 && (
        <p className="px-6 py-8 text-center text-sm text-slate-500">Nothing is forecast to run out before a new order could arrive.</p>
      )}
      {rows && visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-50">
                <th scope="col" className="text-left px-6 py-2">Item</th>
                <th scope="col" className="text-right px-4 py-2">Stock</th>
                <th scope="col" className="text-right px-4 py-2">Use / day</th>
                <th scope="col" className="text-right px-4 py-2">Runs out</th>
                <th scope="col" className="text-right px-4 py-2">Order by</th>
                <th scope="col" className="text-right px-4 py-2">Suggested</th>
                <th scope="col" className="text-right px-6 py-2"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.key} className="border-b border-slate-50 align-top">
                  <td className="px-6 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${STATUS[r.status].badge}`}>{STATUS[r.status].label}</span>
                      <span className="font-bold text-slate-900">{r.name}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {r.unit !== "litres" && <span className="font-mono">{r.key} · </span>}
                      Delivery ~{r.leadTimeDays} days ({r.leadTimeSource})
                      {r.confidence === "LOW" && <span className="text-amber-700 font-bold"> · little history, rough estimate</span>}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtQty(r.stock, r.unit)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.dailyUsage ? fmtQty(r.dailyUsage, r.unit) : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {r.daysLeft === null ? "—" : <>{fmtDate(r.runsOutOn)}<span className="block text-[10px] text-slate-500">{r.daysLeft.toFixed(1)} days</span></>}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums whitespace-nowrap font-bold ${r.status === "ORDER_NOW" ? "text-red-700" : "text-slate-900"}`}>
                    {r.status === "ORDER_NOW" ? "Today" : fmtDate(r.orderBy)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold">
                    {r.onOrder > 0 ? <span className="text-blue-800">{fmtQty(r.onOrder, r.unit)} coming</span> : r.suggestedOrder ? fmtQty(r.suggestedOrder, r.unit) : "—"}
                  </td>
                  <td className="px-6 py-2.5 text-right">
                    {onOrder && (r.status === "ORDER_NOW" || r.status === "ORDER_SOON") && r.suggestedOrder > 0 && (
                      <button onClick={() => onOrder(r)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 whitespace-nowrap">{orderLabel}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
