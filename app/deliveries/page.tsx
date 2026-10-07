"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../utils/axiosInstance";
import { getErrorMessage } from "../../utils/apiError";
import { useAuth } from "../context/AuthContext";

interface SupplyRequest {
  id: number;
  supplierName: string;
  partCode: string;
  partName: string;
  category: string;
  quantityRequested: number;
  agreedUnitPrice: number;
  totalExpectedValue: number;
  status: "PENDING_DISPATCH" | "DISPATCHED" | "RECEIVED" | "CANCELLED";
  orderDate: string;
}

type Tab = "OPEN" | "RECEIVED" | "CANCELLED" | "ALL";

const STATUS: Record<SupplyRequest["status"], { label: string; cls: string }> = {
  PENDING_DISPATCH: { label: "Awaiting dispatch", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" },
  DISPATCHED: { label: "On the way", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  RECEIVED: { label: "Received", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  CANCELLED: { label: "Cancelled", cls: "bg-slate-100 text-slate-500 border-slate-200 line-through" },
};

const lkr = (n: number) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(n || 0);
const poRef = (id: number) => `PO-${String(id).padStart(5, "0")}`;
const inputClass = "w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-500 font-bold text-slate-900";

// Parts purchase orders. The inventory manager receives (or cancels) them; a supplier
// sees only its own company's orders and confirms the real price when dispatching.
export default function DeliveriesPage() {
  const { user } = useAuth();
  const isManager = user?.role === "SUPER_ADMIN" || user?.role === "INVENTORY_MANAGER";

  const [orders, setOrders] = useState<SupplyRequest[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("OPEN");
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [dispatching, setDispatching] = useState<{ order: SupplyRequest; price: string } | null>(null);
  const [receiving, setReceiving] = useState<{ order: SupplyRequest; retail: string } | null>(null);
  const [cancelling, setCancelling] = useState<{ order: SupplyRequest; reason: string } | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get<SupplyRequest[]>("/supply");
  const apply = useCallback((res: Awaited<ReturnType<typeof load>> | Error) => {
    if (res instanceof Error) {
      setLoadError(getErrorMessage(res, "Couldn't load purchase orders."));
      return;
    }
    setOrders([...res.data].sort((a, b) => b.id - a.id));
    setLoadError("");
  }, []);
  const refresh = async () => apply(await load().catch((e: Error) => e));

  useEffect(() => {
    if (!user) return;
    let alive = true;
    load().catch((e: Error) => e).then(r => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [user, apply]);

  const counts = useMemo(() => {
    const all = orders ?? [];
    return {
      OPEN: all.filter(o => o.status === "PENDING_DISPATCH" || o.status === "DISPATCHED").length,
      RECEIVED: all.filter(o => o.status === "RECEIVED").length,
      CANCELLED: all.filter(o => o.status === "CANCELLED").length,
      ALL: all.length,
    };
  }, [orders]);

  const rows = (orders ?? []).filter(o =>
    tab === "ALL" ? true : tab === "OPEN" ? o.status === "PENDING_DISPATCH" || o.status === "DISPATCHED" : o.status === tab);

  const run = async (action: () => Promise<unknown>, success: string, close: () => void) => {
    setBusy(true);
    setDialogError("");
    try {
      await action();
      close();
      setNotice({ type: "ok", text: success });
      await refresh();
    } catch (err) {
      setDialogError(getErrorMessage(err, "That didn't work. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const dispatchPrice = dispatching ? Number(dispatching.price) : 0;
  const dispatchInvalid = !dispatching || !(dispatchPrice > 0);
  const retail = receiving?.retail ? Number(receiving.retail) : null;
  const retailInvalid = retail !== null && !(retail > 0);
  const retailBelowCost = receiving && retail !== null && retail > 0 && retail < receiving.order.agreedUnitPrice;
  const cancelInvalid = !cancelling || cancelling.reason.trim().length < 5;

  const tabs: { key: Tab; label: string }[] = [
    { key: "OPEN", label: "Open" }, { key: "RECEIVED", label: "Received" }, { key: "CANCELLED", label: "Cancelled" }, { key: "ALL", label: "All" },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">{isManager ? "Parts purchase orders" : "Orders to dispatch"}</h1>
          <p className="text-slate-500 font-medium mt-1">
            {isManager
              ? "Orders placed from the Parts page. Receiving one adds the stock and sends the supplier's bill to Finance."
              : "Purchase orders from Lanka Auto Care. Confirm your real unit price when you dispatch."}
          </p>
        </div>

        {notice && (
          <div role="status" className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl text-sm font-bold border ${notice.type === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        <div className="flex flex-wrap gap-2" role="tablist">
          {tabs.map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${tab === t.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"}`}>
              {t.label} <span className="opacity-60">({counts[t.key]})</span>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          {loadError ? (
            <div className="p-10 text-center">
              <p className="text-sm font-bold text-red-600">{loadError}</p>
              <button onClick={refresh} className="mt-3 px-4 py-2 rounded-lg text-sm font-bold text-white bg-slate-900 hover:bg-slate-800">Try again</button>
            </div>
          ) : orders === null ? (
            <div className="p-6 space-y-3" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <th className="px-5 py-3">Order</th>
                    {isManager && <th className="px-5 py-3">Supplier</th>}
                    <th className="px-5 py-3">Part</th>
                    <th className="px-5 py-3 text-right">Value</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(order => (
                    <tr key={order.id} className="border-b border-slate-50 hover:bg-slate-50/50 align-top">
                      <td className="px-5 py-3">
                        <div className="font-mono text-xs font-bold text-slate-900">{poRef(order.id)}</div>
                        <div className="text-xs text-slate-500">{new Date(order.orderDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
                      </td>
                      {isManager && <td className="px-5 py-3 font-bold text-slate-800">{order.supplierName}</td>}
                      <td className="px-5 py-3">
                        <div className="font-bold text-slate-900">{order.partName} <span className="text-xs font-medium text-slate-500">× {order.quantityRequested}</span></div>
                        <div className="text-xs font-mono text-blue-700">{order.partCode} · {lkr(order.agreedUnitPrice)} each</div>
                      </td>
                      <td className="px-5 py-3 text-right font-black text-slate-900 tabular-nums">{lkr(order.totalExpectedValue)}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block px-2.5 py-1 border rounded-md text-[10px] font-black uppercase tracking-widest ${STATUS[order.status]?.cls ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
                          {STATUS[order.status]?.label ?? order.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          {!isManager && order.status === "PENDING_DISPATCH" && (
                            <button onClick={() => { setDialogError(""); setDispatching({ order, price: String(order.agreedUnitPrice) }); }}
                              className="px-4 py-2 bg-slate-900 hover:bg-blue-700 text-white rounded-lg text-xs font-bold">Confirm &amp; dispatch</button>
                          )}
                          {isManager && order.status === "PENDING_DISPATCH" && (
                            <button onClick={() => { setDialogError(""); setCancelling({ order, reason: "" }); }}
                              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:border-red-200 hover:text-red-700">Cancel order</button>
                          )}
                          {isManager && order.status === "DISPATCHED" && (
                            <button onClick={() => { setDialogError(""); setReceiving({ order, retail: "" }); }}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold">Mark received</button>
                          )}
                          {(order.status === "RECEIVED" || order.status === "CANCELLED" || (!isManager && order.status === "DISPATCHED")) && (
                            <span className="text-xs font-bold text-slate-400">No action needed</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={isManager ? 6 : 5} className="px-5 py-14 text-center text-slate-500">
                      {tab === "OPEN" ? (isManager ? "No open orders. Order stock from the Parts page (Reorder)." : "No orders waiting for you.") : "No orders here."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Supplier: confirm the real price, then dispatch */}
      {dispatching && (
        <Dialog title="Confirm your price" sub={`${poRef(dispatching.order.id)} · ${dispatching.order.partName} × ${dispatching.order.quantityRequested}`} onClose={() => !busy && setDispatching(null)}>
          <p className="text-sm text-slate-600 mb-4">
            Lanka Auto Care estimated <b>{lkr(dispatching.order.agreedUnitPrice)}</b> per unit. Confirm it or enter your real price. You will be invoiced at this price.
          </p>
          <label htmlFor="dp-price" className="block text-xs font-bold text-slate-700 mb-1">Unit price (LKR)</label>
          <input id="dp-price" type="number" min={0} step="0.01" autoFocus value={dispatching.price}
            onChange={e => setDispatching({ ...dispatching, price: e.target.value })} className={inputClass} />
          {!dispatchInvalid && <p className="mt-2 text-xs text-slate-500">Order total: <b>{lkr(dispatchPrice * dispatching.order.quantityRequested)}</b></p>}
          {dispatching.price !== "" && dispatchInvalid && <p className="mt-2 text-xs font-bold text-red-600">Enter a price greater than Rs. 0.</p>}
          <DialogFooter error={dialogError} busy={busy} disabled={dispatchInvalid} confirm="Confirm & dispatch" onCancel={() => setDispatching(null)}
            onConfirm={() => run(() => api.put(`/supply/${dispatching.order.id}/dispatch`, { confirmedUnitPrice: dispatchPrice }),
              `${poRef(dispatching.order.id)} dispatched at ${lkr(dispatchPrice)} per unit.`, () => setDispatching(null))} />
        </Dialog>
      )}

      {/* Manager: receive, optionally with a new retail price */}
      {receiving && (
        <Dialog title="Receive delivery" sub={`${poRef(receiving.order.id)} · ${receiving.order.partName} × ${receiving.order.quantityRequested}`} onClose={() => !busy && setReceiving(null)}>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl mb-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-slate-500">Cost per unit (confirmed)</span><span className="font-bold">{lkr(receiving.order.agreedUnitPrice)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Bill sent to Finance</span><span className="font-bold">{lkr(receiving.order.totalExpectedValue)}</span></div>
          </div>
          <label htmlFor="rc-retail" className="block text-xs font-bold text-slate-700 mb-1">New selling price per unit <span className="font-medium text-slate-500">(optional)</span></label>
          <input id="rc-retail" type="number" min={0} step="0.01" placeholder="Leave blank to keep the current price" value={receiving.retail}
            onChange={e => setReceiving({ ...receiving, retail: e.target.value })} className={inputClass} />
          {retailInvalid && <p className="mt-2 text-xs font-bold text-red-600">Enter a price greater than Rs. 0, or leave it blank.</p>}
          {retailBelowCost && <p className="mt-2 text-xs font-bold text-amber-700">That&apos;s below the cost of {lkr(receiving.order.agreedUnitPrice)}. Each sale would lose money.</p>}
          <DialogFooter error={dialogError} busy={busy} disabled={retailInvalid} confirm="Confirm receipt" confirmClass="bg-emerald-600 hover:bg-emerald-700" onCancel={() => setReceiving(null)}
            onConfirm={() => run(() => api.put(`/supply/${receiving.order.id}/receive`, retail ? { newRetailPrice: retail } : {}),
              `${poRef(receiving.order.id)} received: ${receiving.order.quantityRequested} added to stock and the bill sent to Finance.`, () => setReceiving(null))} />
        </Dialog>
      )}

      {/* Manager: cancel an order that hasn't been dispatched */}
      {cancelling && (
        <Dialog title="Cancel this order?" sub={`${poRef(cancelling.order.id)} · ${cancelling.order.partName} × ${cancelling.order.quantityRequested} from ${cancelling.order.supplierName}`} onClose={() => !busy && setCancelling(null)}>
          <p className="text-sm text-slate-600 mb-4">The supplier will no longer see it to dispatch. The order is kept, marked as cancelled.</p>
          <label htmlFor="cn-reason" className="block text-xs font-bold text-slate-700 mb-1">Reason</label>
          <input id="cn-reason" autoFocus maxLength={200} placeholder="e.g. Ordered the wrong part" value={cancelling.reason}
            onChange={e => setCancelling({ ...cancelling, reason: e.target.value })} className={inputClass} />
          <DialogFooter error={dialogError} busy={busy} disabled={cancelInvalid} confirm="Cancel order" confirmClass="bg-red-600 hover:bg-red-700" cancelLabel="Keep order" onCancel={() => setCancelling(null)}
            onConfirm={() => run(() => api.put(`/supply/${cancelling.order.id}/cancel`, { reason: cancelling.reason.trim() }),
              `${poRef(cancelling.order.id)} cancelled.`, () => setCancelling(null))} />
        </Dialog>
      )}
    </div>
  );
}

function Dialog({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}
      onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-md w-full border border-slate-200">
        <h3 className="text-xl font-black text-slate-900">{title}</h3>
        <p className="text-xs font-bold text-slate-500 mt-1 mb-5">{sub}</p>
        {children}
      </div>
    </div>
  );
}

function DialogFooter({ error, busy, disabled, confirm, confirmClass = "bg-slate-900 hover:bg-blue-700", cancelLabel = "Close", onCancel, onConfirm }: {
  error: string; busy: boolean; disabled: boolean; confirm: string; confirmClass?: string; cancelLabel?: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <>
      {error && <p role="alert" className="mt-4 text-sm font-bold text-red-600">{error}</p>}
      <div className="flex gap-3 mt-6">
        <button onClick={onCancel} disabled={busy} className="flex-1 py-3 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-60">{cancelLabel}</button>
        <button onClick={onConfirm} disabled={busy || disabled} className={`flex-1 py-3 rounded-xl font-bold text-white disabled:opacity-50 ${confirmClass}`}>
          {busy ? "Saving..." : confirm}
        </button>
      </div>
    </>
  );
}
