"use client";

import { useState, useEffect } from "react";
import api from "../../utils/axiosInstance";
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
  status: string; // PENDING_DISPATCH, DISPATCHED, RECEIVED
  orderDate: string;
}

export default function SupplyChainDashboard() {
  const { user } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [orders, setOrders] = useState<SupplyRequest[]>([]);

  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" }>({
    isOpen: false, title: "", message: "", type: "success"
  });

  // NEW: dispatch and receive both used to be a single instant click with no
  // price step at all. The manager's "Agreed Unit Price" at order time is
  // only a target estimate — the supplier is the one who actually knows
  // their real cost, so dispatch is where that becomes authoritative. The
  // retail markup is a separate decision the manager makes at receiving time.
  const [dispatchModal, setDispatchModal] = useState<{ isOpen: boolean; order: SupplyRequest | null; confirmedPrice: string }>({
    isOpen: false, order: null, confirmedPrice: "",
  });
  const [receiveModal, setReceiveModal] = useState<{ isOpen: boolean; order: SupplyRequest | null; newRetailPrice: string }>({
    isOpen: false, order: null, newRetailPrice: "",
  });
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  const isManager = user?.role === "SUPER_ADMIN" || user?.role === "INVENTORY_MANAGER";

  const fetchOrders = async () => {
    try {
      const res = await api.get("/supply");
      // Sort newest to top
      setOrders(res.data.sort((a: SupplyRequest, b: SupplyRequest) => b.id - a.id));
    } catch (err) {
      console.error("Failed to load supply chain requests.", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    if (user) fetchOrders();
  }, [user]);

  // SUPPLIER ACTION: Confirm the real price, then dispatch
  const executeDispatch = async () => {
    if (!dispatchModal.order) return;
    const parsedPrice = parseFloat(dispatchModal.confirmedPrice);
    if (!dispatchModal.confirmedPrice || isNaN(parsedPrice) || parsedPrice <= 0) {
      setModal({ isOpen: true, type: "error", title: "Price Required", message: "Enter your real unit price before dispatching — this becomes the confirmed cost Lanka Auto Care is invoiced." });
      return;
    }
    setIsSubmittingAction(true);
    try {
      await api.put(`/supply/${dispatchModal.order.id}/dispatch`, { confirmedUnitPrice: parsedPrice });
      setModal({ isOpen: true, type: "success", title: "Order Dispatched", message: `Lanka Auto Care has been notified — confirmed at Rs. ${parsedPrice.toLocaleString()} / unit.` });
      setDispatchModal({ isOpen: false, order: null, confirmedPrice: "" });
      fetchOrders();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Action Failed", message: "Could not update the dispatch status." });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // MANAGER ACTION: Optionally set a new retail price, then receive & trigger automation
  const executeReceive = async () => {
    if (!receiveModal.order) return;
    const parsedRetailPrice = receiveModal.newRetailPrice ? parseFloat(receiveModal.newRetailPrice) : undefined;
    setIsSubmittingAction(true);
    try {
      await api.put(
        `/supply/${receiveModal.order.id}/receive`,
        parsedRetailPrice ? { newRetailPrice: parsedRetailPrice } : {}
      );
      setModal({
        isOpen: true,
        type: "success",
        title: "Stock Injected Successfully",
        message: "Physical goods verified. Live inventory has been incremented, and an UNPAID invoice has been auto-generated in the Payables ledger for Finance."
          + (parsedRetailPrice ? ` Retail price updated to Rs. ${parsedRetailPrice.toLocaleString()}.` : ""),
      });
      setReceiveModal({ isOpen: false, order: null, newRetailPrice: "" });
      fetchOrders();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Receiving Failed", message: "Could not process the stock injection." });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const formatLKR = (amount: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);

  if (!isMounted) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12 relative">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10 animate-fade-in-up">
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Procurement & Deliveries</h1>
          <p className="text-slate-500 font-medium mt-2">
            {isManager
              ? "Track active purchase orders, verify arrivals, and auto-sync stock levels."
              : "Review incoming purchase orders from Lanka Auto Care and dispatch goods."}
          </p>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 h-full animate-fade-in-up">
          <h3 className="text-xl font-bold text-slate-800 mb-6">
            {isManager ? "Master Supply Chain Ledger" : "My Active Purchase Orders"}
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="pb-3 pr-4">PO Ref & Date</th>
                  {isManager && <th className="pb-3 pr-4">Target Supplier</th>}
                  <th className="pb-3 pr-4">Requested Item</th>
                  <th className="pb-3 pr-4 text-right">Order Value</th>
                  <th className="pb-3 text-center">Logistics Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm font-medium text-slate-700">
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 pr-4">
                      <div className="font-mono text-xs text-slate-900 font-bold">PO-{order.id.toString().padStart(5, '0')}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{new Date(order.orderDate).toLocaleDateString()}</div>
                    </td>
                    {isManager && <td className="py-4 pr-4 font-bold text-slate-800">{order.supplierName}</td>}
                    <td className="py-4 pr-4">
                      <div className="font-bold text-slate-900">{order.partName} <span className="text-xs text-slate-500 font-normal">x{order.quantityRequested}</span></div>
                      <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wider mt-0.5">{order.partCode}</div>
                    </td>
                    <td className="py-4 pr-4 text-right font-black text-slate-900 text-base">
                      {formatLKR(order.totalExpectedValue)}
                    </td>
                    <td className="py-4 text-center">
                        <span className={`px-3 py-1.5 border rounded-md text-[9px] font-black uppercase tracking-widest ${
                          order.status === 'PENDING_DISPATCH' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                          order.status === 'DISPATCHED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {order.status.replace('_', ' ')}
                        </span>
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {/* SUPPLIER ACTIONS */}
                        {!isManager && order.status === 'PENDING_DISPATCH' && (
                          <button onClick={() => setDispatchModal({ isOpen: true, order, confirmedPrice: String(order.agreedUnitPrice) })} className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-lg text-[10px] uppercase tracking-widest font-black shadow-md transition-all active:scale-95">
                            Confirm & Dispatch
                          </button>
                        )}
                        {!isManager && order.status !== 'PENDING_DISPATCH' && (
                          <span className="text-xs font-bold text-slate-400">Processed</span>
                        )}

                        {/* MANAGER ACTIONS */}
                        {isManager && order.status === 'DISPATCHED' && (
                          <button onClick={() => setReceiveModal({ isOpen: true, order, newRetailPrice: "" })} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] uppercase tracking-widest font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                            Mark Received
                          </button>
                        )}
                        {isManager && order.status === 'PENDING_DISPATCH' && (
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Awaiting Supplier</span>
                        )}
                        {isManager && order.status === 'RECEIVED' && (
                          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 justify-end">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                            Stock Added
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={isManager ? 6 : 5} className="text-center py-16 text-slate-500 font-medium">No purchase orders found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SUPPLIER: CONFIRM PRICE & DISPATCH MODAL */}
      {dispatchModal.isOpen && dispatchModal.order && (
        <div className="fixed inset-0 z-[70] flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-1">Confirm Your Price</h3>
            <p className="text-xs font-bold text-slate-500 mb-6 uppercase tracking-widest">{dispatchModal.order.partCode} • {dispatchModal.order.partName} • x{dispatchModal.order.quantityRequested}</p>
            <p className="text-sm text-slate-600 font-medium mb-4">
              Lanka Auto Care estimated <span className="font-bold text-slate-900">{formatLKR(dispatchModal.order.agreedUnitPrice)}</span> per unit when placing this order.
              Confirm it, or enter your real price below — this becomes the price you're invoiced at.
            </p>
            <label className="block text-xs font-black text-slate-600 uppercase mb-2">Your Confirmed Unit Price (LKR)</label>
            <input
              type="number" step="0.01" autoFocus
              value={dispatchModal.confirmedPrice}
              onChange={(e) => setDispatchModal({ ...dispatchModal, confirmedPrice: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 font-black text-slate-900 mb-6"
            />
            <div className="flex gap-3">
              <button onClick={() => setDispatchModal({ isOpen: false, order: null, confirmedPrice: "" })} disabled={isSubmittingAction} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-60">Cancel</button>
              <button onClick={executeDispatch} disabled={isSubmittingAction} className="flex-1 px-4 py-3 rounded-xl font-black text-white bg-slate-900 hover:bg-blue-600 shadow-md disabled:opacity-60">
                {isSubmittingAction ? "Confirming..." : "Confirm & Dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANAGER: RECEIVE + SET RETAIL PRICE MODAL */}
      {receiveModal.isOpen && receiveModal.order && (
        <div className="fixed inset-0 z-[70] flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-1">Receive Delivery</h3>
            <p className="text-xs font-bold text-slate-500 mb-6 uppercase tracking-widest">{receiveModal.order.partCode} • {receiveModal.order.partName} • x{receiveModal.order.quantityRequested}</p>
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Confirmed cost paid</span>
                <span className="font-black text-slate-900">{formatLKR(receiveModal.order.agreedUnitPrice)} / unit</span>
              </div>
            </div>
            <label className="block text-xs font-black text-slate-600 uppercase mb-2">New Retail Price (optional)</label>
            <p className="text-[11px] text-slate-400 font-medium mb-2">Leave blank to keep the current retail price for this part unchanged.</p>
            <input
              type="number" step="0.01" placeholder="e.g. cost + your usual markup"
              value={receiveModal.newRetailPrice}
              onChange={(e) => setReceiveModal({ ...receiveModal, newRetailPrice: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-emerald-500 font-black text-slate-900 mb-6"
            />
            <div className="flex gap-3">
              <button onClick={() => setReceiveModal({ isOpen: false, order: null, newRetailPrice: "" })} disabled={isSubmittingAction} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-60">Cancel</button>
              <button onClick={executeReceive} disabled={isSubmittingAction} className="flex-1 px-4 py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-md disabled:opacity-60">
                {isSubmittingAction ? "Processing..." : "Confirm Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Alert Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">{modal.title}</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">{modal.message}</p>
            <button onClick={() => setModal({ ...modal, isOpen: false })} className="w-full px-4 py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all active:scale-95">Acknowledge</button>
          </div>
        </div>
      )}
    </div>
  );
}