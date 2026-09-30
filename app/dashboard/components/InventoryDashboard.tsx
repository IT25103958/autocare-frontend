"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "../../../utils/axiosInstance";
import { InventorySummary, LowStockRow, lkr } from "../../parts/_components/inventory";

interface PurchaseOrder {
  id: number;
  supplierName: string;
  partCode: string;
  partName: string;
  quantityRequested: number;
  totalExpectedValue: number;
  status: string; // PENDING_DISPATCH, DISPATCHED, RECEIVED
  orderDate: string;
}

interface ReturnRequest {
  id: number;
  partName: string;
  quantity: number;
  supplierName: string;
  status: string; // PENDING, APPROVED_REPLACEMENT, APPROVED_REFUND, REJECTED, REPLACEMENT_RECEIVED
}

type Urgency = "critical" | "warning" | "info";

const DOT: Record<Urgency, string> = { critical: "bg-red-500", warning: "bg-amber-500", info: "bg-blue-500" };

// Live warehouse overview: stock health, open purchase orders and returns, and
// an action list built from real data (was hard-coded sample figures).
export default function InventoryDashboard({ userName }: { userName?: string }) {
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.allSettled([
      api.get<InventorySummary>("/parts/summary"),
      api.get<LowStockRow[]>("/parts/low-stock"),
      api.get<PurchaseOrder[]>("/supply"),
      api.get<ReturnRequest[]>("/rma"),
    ]).then(([s, l, o, r]) => {
      if (s.status === "fulfilled") setSummary(s.value.data);
      if (l.status === "fulfilled") setLowStock(l.value.data);
      if (o.status === "fulfilled") setOrders(o.value.data);
      if (r.status === "fulfilled") setReturns(r.value.data);
      if ([s, l, o, r].some(x => x.status === "rejected")) setError("Some figures couldn't be loaded.");
    });
  }, []);

  const inTransit = orders.filter(o => o.status === "DISPATCHED");
  const awaitingSupplier = orders.filter(o => o.status === "PENDING_DISPATCH");
  const replacementsDue = returns.filter(r => r.status === "APPROVED_REPLACEMENT");
  const returnsPending = returns.filter(r => r.status === "PENDING");

  // Most urgent first: out of stock, dispatched orders to receive, low stock, replacements due.
  const actions: { key: string; urgency: Urgency; title: string; detail: string; href: string }[] = [
    ...lowStock.filter(r => r.outOfStock).map(r => ({
      key: `out-${r.part.partID}`, urgency: "critical" as Urgency,
      title: `${r.part.name} (${r.part.partCode})`,
      detail: `Out of stock.${r.onOrder ? ` ${r.onOrder} on order.` : " Nothing on order — reorder now."}`,
      href: "/parts",
    })),
    ...inTransit.map(o => ({
      key: `po-${o.id}`, urgency: "info" as Urgency,
      title: `Receive PO-${String(o.id).padStart(5, "0")}: ${o.partName}`,
      detail: `${o.quantityRequested} units dispatched by ${o.supplierName} — confirm receipt to add stock.`,
      href: "/deliveries",
    })),
    ...lowStock.filter(r => !r.outOfStock).map(r => ({
      key: `low-${r.part.partID}`, urgency: "warning" as Urgency,
      title: `${r.part.name} (${r.part.partCode})`,
      detail: `${r.part.currentStock} left (minimum ${r.part.minimumStockLevel}).${r.suggestedOrder ? ` Suggest ordering ${r.suggestedOrder}.` : ` ${r.onOrder} already on order.`}`,
      href: "/parts",
    })),
    ...replacementsDue.map(rm => ({
      key: `rma-${rm.id}`, urgency: "info" as Urgency,
      title: `Replacement due: ${rm.partName}`,
      detail: `${rm.supplierName} approved ${rm.quantity} replacement unit(s) — receive them on the Returns page.`,
      href: "/rma",
    })),
  ];

  const cards = summary ? [
    {
      label: "Critical Stock Levels", border: "border-l-red-500",
      value: `${summary.outOfStock + summary.lowStock} Items`,
      sub: summary.outOfStock ? `${summary.outOfStock} out of stock` : summary.lowStock ? "At or below minimum" : "All above minimum",
      subColor: summary.outOfStock + summary.lowStock ? "text-red-600" : "text-emerald-600",
    },
    {
      label: "Catalog", border: "border-l-emerald-500",
      value: `${summary.activeParts} SKU`,
      sub: `${summary.totalUnits.toLocaleString()} units · ${lkr(summary.stockValueAtCost)} at cost`,
      subColor: "text-emerald-700",
    },
    {
      label: "Open Purchase Orders", border: "border-l-blue-500",
      value: `${inTransit.length + awaitingSupplier.length} Orders`,
      sub: `${inTransit.length} in transit · ${awaitingSupplier.length} awaiting supplier`,
      subColor: "text-blue-600",
    },
  ] : [];

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Warehouse & Inventory</h1>
          <p className="text-sm font-bold text-slate-500 mt-1">Welcome, {userName}. Here is your live stock overview.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/parts" className="px-5 py-2.5 bg-white border border-slate-200 text-slate-800 text-sm font-black uppercase tracking-wider rounded-xl hover:bg-slate-50">
            Parts Catalog
          </Link>
          <Link href="/deliveries" className="px-5 py-2.5 bg-blue-600 text-white text-sm font-black uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-500">
            Receive Deliveries
          </Link>
        </div>
      </div>

      {error && <p className="text-sm font-bold text-red-600">{error}</p>}

      {/* INVENTORY KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map(c => (
          <div key={c.label} className={`bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 ${c.border}`}>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{c.label}</h3>
            <div className="text-3xl font-black text-slate-900 tabular-nums">{c.value}</div>
            <p className={`text-sm font-bold mt-2 ${c.subColor}`}>{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* URGENT ACTIONS (live) */}
        <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl">
          <h2 className="text-xl font-black mb-4">Urgent Actions</h2>
          {actions.length === 0 ? (
            <p className="text-sm text-slate-300">Nothing needs attention — stock is healthy and no deliveries are waiting. 🎉</p>
          ) : (
            <ul className="space-y-3">
              {actions.slice(0, 6).map(a => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-start gap-3 bg-slate-800 hover:bg-slate-700 p-4 rounded-xl transition-colors">
                    <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${DOT[a.urgency]}`} aria-hidden="true"></span>
                    <div>
                      <p className="text-sm font-bold text-slate-100">{a.title}</p>
                      <p className="text-xs font-medium text-slate-300 mt-1">{a.detail}</p>
                    </div>
                  </Link>
                </li>
              ))}
              {actions.length > 6 && <li className="text-xs text-slate-300 pl-1">+ {actions.length - 6} more on the Parts Catalog</li>}
            </ul>
          )}
        </div>

        {/* USAGE + RETURNS */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 mb-1">Most Used Parts</h2>
            <p className="text-xs text-slate-500 mb-3">Workshop jobs + counter sales, last 30 days</p>
            {!summary || summary.topUsedLast30Days.length === 0 ? (
              <p className="text-sm text-slate-500">No usage recorded yet.</p>
            ) : (
              <ol className="space-y-2">
                {summary.topUsedLast30Days.map((t, i) => (
                  <li key={t.partId} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700"><span className="text-slate-400 tabular-nums mr-2">{i + 1}.</span>{t.partName} <span className="font-mono text-[10px] text-slate-500">{t.partCode}</span></span>
                    <span className="font-black tabular-nums text-slate-900">{t.quantity}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 mb-3">Supplier Returns (RMA)</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-3xl font-black text-slate-900 tabular-nums">{returnsPending.length}</p>
                <p className="text-xs font-bold text-slate-500">Awaiting supplier decision</p>
              </div>
              <div>
                <p className="text-3xl font-black text-slate-900 tabular-nums">{replacementsDue.length}</p>
                <p className="text-xs font-bold text-slate-500">Replacements to receive</p>
              </div>
            </div>
            <Link href="/rma" className="inline-block mt-3 text-xs font-bold text-blue-700 hover:underline">Open returns &rarr;</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
