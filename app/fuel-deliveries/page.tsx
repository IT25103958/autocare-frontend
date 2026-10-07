"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../../utils/axiosInstance";
import { getErrorMessage } from "../../utils/apiError";

interface FuelDelivery {
  id: number;
  // Supplier company (supplier master id) and its name at order time.
  supplierId?: number | null;
  supplierName: string;
  fuelType: string;
  litersOrdered: number;
  agreedPricePerLiter: number;
  orderedPricePerLiter?: number | null;
  totalExpectedValue: number;
  litersReceived?: number;
  status: string; // ORDERED, DISPATCHED, RECEIVED, CANCELLED
  receivedDate?: string;
  deliveryNoteNumber?: string | null;
  vehicleNumber?: string | null;
  payableId?: number | null;
  cancelReason?: string | null;
  cancelledBy?: string | null;
}

interface FuelTank {
  tankId: number;
  fuelType: string;
  capacity: number;
  currentStock: number;
}

interface SupplierOption {
  id: number;
  supplierCode: string;
  companyName: string;
}

export default function FuelSupplyChainPage() {
  const { user, isLoading } = useAuth();
  const [deliveries, setDeliveries] = useState<FuelDelivery[]>([]);
  const [tanks, setTanks] = useState<FuelTank[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" }>({
    isOpen: false, title: "", message: "", type: "success"
  });

  // Same price-confirmation pattern as the parts Deliveries page: the
  // supervisor's price at order time is only a target — the supplier
  // confirms the real one at dispatch. Receiving separately captures the
  // actual measured liters (bowser deliveries commonly vary slightly) and
  // optionally updates the pump price.
  const [orderModal, setOrderModal] = useState({ isOpen: false, fuelType: "", supplierId: "", litersOrdered: "", targetPrice: "" });
  const [dispatchModal, setDispatchModal] = useState<{ isOpen: boolean; delivery: FuelDelivery | null; confirmedPrice: string }>({
    isOpen: false, delivery: null, confirmedPrice: "",
  });
  const [receiveModal, setReceiveModal] = useState<{ isOpen: boolean; delivery: FuelDelivery | null; litersReceived: string; newPumpPrice: string; deliveryNote: string; vehicleNumber: string }>({
    isOpen: false, delivery: null, litersReceived: "", newPumpPrice: "", deliveryNote: "", vehicleNumber: "",
  });
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [cancelModal, setCancelModal] = useState<{ delivery: FuelDelivery; reason: string } | null>(null);

  const isSupervisor = user?.role === "FUEL_STATION_SUPERVISOR" || user?.role === "SUPER_ADMIN";
  const isSupplier = user?.role === "SUPPLIER";
  // Everyone except a supplier sees the whole ledger. Finance and the owner
  // see it read-only (open orders are future liabilities).
  const seesAll = !isSupplier;

  const fetchDeliveries = async () => {
    try {
      const res = await api.get<FuelDelivery[]>("/fuel-deliveries");
      setDeliveries(res.data.sort((a, b) => b.id - a.id));
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Couldn't Load Deliveries", message: getErrorMessage(err, "Failed to load fuel deliveries.") });
    }
  };

  useEffect(() => {
    if (!user) return;
    // Started from a callback so the state updates aren't made inside the effect body.
    Promise.resolve().then(fetchDeliveries);
    if (isSupervisor) {
      const loadFailed = (what: string) => (err: unknown) =>
        setModal({ isOpen: true, type: "error", title: `Couldn't Load ${what}`, message: getErrorMessage(err, `The ${what.toLowerCase()} list couldn't be loaded, so new orders can't be placed. Refresh to try again.`) });
      api.get<FuelTank[]>("/tanks").then((res) => setTanks(res.data)).catch(loadFailed("Tanks"));
      // Only active suppliers approved for fuel can be ordered from.
      api.get<SupplierOption[]>("/suppliers/options", { params: { category: "FUEL" } }).then((res) => setSuppliers(res.data)).catch(loadFailed("Suppliers"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the signed-in user changes
  }, [user]);

  const supplierLabel = (d: { supplierId?: number | null; supplierName: string }) => {
    const match = suppliers.find((s) => s.id === d.supplierId);
    return match ? `${match.companyName} (${match.supplierCode})` : d.supplierName;
  };

  const formatLKR = (amount: number) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(amount || 0);

  // Space left in a tank once fuel already on its way is counted. Mirrors
  // the backend's check in FuelDeliveryController.placeOrder.
  const spaceFor = (fuelType: string) => {
    const tank = tanks.find((t) => t.fuelType === fuelType);
    if (!tank) return null;
    const free = Math.max(0, tank.capacity - tank.currentStock);
    const onOrder = deliveries
      .filter((d) => d.fuelType === fuelType && (d.status === "ORDERED" || d.status === "DISPATCHED"))
      .reduce((sum, d) => sum + d.litersOrdered, 0);
    return { free, onOrder, available: Math.max(0, free - onOrder) };
  };
  const orderSpace = orderModal.fuelType ? spaceFor(orderModal.fuelType) : null;
  const orderLiters = parseFloat(orderModal.litersOrdered) || 0;
  const orderTooBig = orderSpace != null && orderLiters > orderSpace.available;

  // SUPERVISOR: Place a fuel purchase order
  const executePlaceOrder = async () => {
    const liters = parseFloat(orderModal.litersOrdered);
    const price = parseFloat(orderModal.targetPrice);
    if (!orderModal.fuelType) { setModal({ isOpen: true, type: "error", title: "Fuel Type Required", message: "Select which fuel this order is for." }); return; }
    if (!orderModal.supplierId) { setModal({ isOpen: true, type: "error", title: "Supplier Required", message: "Select a supplier to order from." }); return; }
    if (!orderModal.litersOrdered || isNaN(liters) || liters <= 0) { setModal({ isOpen: true, type: "error", title: "Invalid Quantity", message: "Enter the liters to order — must be greater than zero." }); return; }
    if (!orderModal.targetPrice || isNaN(price) || price <= 0) { setModal({ isOpen: true, type: "error", title: "Invalid Price", message: "Enter a target price per liter — must be greater than zero." }); return; }

    setIsSubmittingAction(true);
    try {
      await api.post("/fuel-deliveries/order", {
        fuelType: orderModal.fuelType, supplierId: Number(orderModal.supplierId),
        litersOrdered: liters, agreedPricePerLiter: price,
      });
      setModal({ isOpen: true, type: "success", title: "Order Sent", message: `Requested ${liters}L of ${orderModal.fuelType} from ${suppliers.find((x) => String(x.id) === orderModal.supplierId)?.companyName ?? "the supplier"}.` });
      setOrderModal({ isOpen: false, fuelType: "", supplierId: "", litersOrdered: "", targetPrice: "" });
      fetchDeliveries();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Order Failed", message: getErrorMessage(err, "Could not place the fuel order.") });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // SUPPLIER: Confirm the real price, then dispatch
  const executeDispatch = async () => {
    if (!dispatchModal.delivery) return;
    const parsedPrice = parseFloat(dispatchModal.confirmedPrice);
    if (!dispatchModal.confirmedPrice || isNaN(parsedPrice) || parsedPrice <= 0) {
      setModal({ isOpen: true, type: "error", title: "Price Required", message: "Enter your real price per liter before dispatching — this becomes the confirmed cost Lanka Auto Care is invoiced." });
      return;
    }
    setIsSubmittingAction(true);
    try {
      await api.put(`/fuel-deliveries/${dispatchModal.delivery.id}/dispatch`, { confirmedPricePerLiter: parsedPrice });
      setModal({ isOpen: true, type: "success", title: "Bowser Dispatched", message: `Lanka Auto Care has been notified — confirmed at ${formatLKR(parsedPrice)} / liter.` });
      setDispatchModal({ isOpen: false, delivery: null, confirmedPrice: "" });
      fetchDeliveries();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Action Failed", message: getErrorMessage(err, "Could not update the dispatch status.") });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // SUPERVISOR: Confirm measured liters + optional new pump price, then receive
  const executeReceive = async () => {
    if (!receiveModal.delivery) return;
    const liters = parseFloat(receiveModal.litersReceived);
    if (!receiveModal.litersReceived || isNaN(liters) || liters <= 0) {
      setModal({ isOpen: true, type: "error", title: "Measurement Required", message: "Enter the dip-measured liters actually received." });
      return;
    }
    if (!receiveModal.deliveryNote.trim()) {
      setModal({ isOpen: true, type: "error", title: "Delivery Note Required", message: "Enter the delivery note number from the supplier's paperwork." });
      return;
    }
    const newPumpPrice = receiveModal.newPumpPrice ? parseFloat(receiveModal.newPumpPrice) : undefined;
    setIsSubmittingAction(true);
    try {
      const res = await api.put(
        `/fuel-deliveries/${receiveModal.delivery.id}/receive`,
        {
          litersReceived: liters,
          deliveryNoteNumber: receiveModal.deliveryNote.trim(),
          vehicleNumber: receiveModal.vehicleNumber.trim() || null,
          ...(newPumpPrice ? { newPumpPrice } : {}),
        }
      );
      setModal({ isOpen: true, type: "success", title: "Delivery Received", message: res.data || "Tank topped up and Finance notified." });
      setReceiveModal({ isOpen: false, delivery: null, litersReceived: "", newPumpPrice: "", deliveryNote: "", vehicleNumber: "" });
      fetchDeliveries();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Receiving Failed", message: getErrorMessage(err, "Could not process the delivery.") });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // SUPERVISOR cancels, or SUPPLIER declines, an order not yet dispatched.
  const executeCancel = async () => {
    if (!cancelModal || cancelModal.reason.trim().length < 5) return;
    setIsSubmittingAction(true);
    try {
      await api.put(`/fuel-deliveries/${cancelModal.delivery.id}/cancel`, { reason: cancelModal.reason.trim() });
      setModal({ isOpen: true, type: "success", title: "Order Cancelled", message: `FD-${cancelModal.delivery.id.toString().padStart(5, "0")} was cancelled.` });
      setCancelModal(null);
      fetchDeliveries();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Cancel Failed", message: getErrorMessage(err, "Could not cancel the order.") });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12 relative">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10 animate-fade-in-up flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Fuel Supply Chain</h1>
            <p className="text-slate-500 font-medium mt-2">
              {isSupervisor
                ? "Order bulk fuel deliveries, verify bowser arrivals, and auto-sync tank levels."
                : isSupplier
                  ? "Review incoming fuel orders from Lanka Auto Care and dispatch bowsers."
                  : "Read-only view of every fuel purchase order, its supplier and its bill."}
            </p>
          </div>
          {isSupervisor && (
            <button onClick={() => setOrderModal({ ...orderModal, isOpen: true })} className="px-6 py-3 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex-shrink-0">
              + Request Fuel Delivery
            </button>
          )}
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 h-full animate-fade-in-up">
          <h3 className="text-xl font-bold text-slate-800 mb-6">
            {seesAll ? "Master Fuel Delivery Ledger" : "My Active Fuel Orders"}
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="pb-3 pr-4">Delivery Ref</th>
                  {seesAll && <th className="pb-3 pr-4">Target Supplier</th>}
                  <th className="pb-3 pr-4">Fuel & Quantity</th>
                  <th className="pb-3 pr-4 text-right">Order Value</th>
                  <th className="pb-3 text-center">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm font-medium text-slate-700">
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 pr-4">
                      <div className="font-mono text-xs text-slate-900 font-bold">FD-{d.id.toString().padStart(5, "0")}</div>
                      {d.receivedDate && <div className="text-[10px] text-slate-500 mt-0.5">{new Date(d.receivedDate).toLocaleDateString()}</div>}
                      {d.deliveryNoteNumber && (
                        <div className="text-[10px] text-slate-500">DN {d.deliveryNoteNumber}{d.vehicleNumber && ` · ${d.vehicleNumber}`}</div>
                      )}
                      {seesAll && d.payableId != null && <div className="text-[10px] font-bold text-blue-600">Bill #{d.payableId}</div>}
                      {d.status === "CANCELLED" && d.cancelReason && (
                        <div className="text-[10px] text-slate-400 max-w-[14rem] truncate" title={d.cancelReason}>Cancelled by {d.cancelledBy}: {d.cancelReason}</div>
                      )}
                    </td>
                    {seesAll && <td className="py-4 pr-4 font-bold text-slate-800">{supplierLabel(d)}</td>}
                    <td className="py-4 pr-4">
                      <div className="font-bold text-slate-900">{d.fuelType} <span className="text-xs text-slate-500 font-normal">x{d.litersOrdered}L</span></div>
                      {d.litersReceived != null && d.litersReceived !== d.litersOrdered && (
                        <div className="text-[10px] text-amber-600 font-bold mt-0.5">Received: {d.litersReceived}L</div>
                      )}
                    </td>
                    <td className="py-4 pr-4 text-right font-black text-slate-900 text-base">{formatLKR(d.totalExpectedValue)}</td>
                    <td className="py-4 text-center">
                      <span className={`px-3 py-1.5 border rounded-md text-[9px] font-black uppercase tracking-widest ${
                        d.status === "ORDERED" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                        d.status === "DISPATCHED" ? "bg-blue-50 text-blue-700 border-blue-200" :
                        d.status === "CANCELLED" ? "bg-slate-100 text-slate-500 border-slate-200" :
                        "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {/* SUPPLIER ACTIONS */}
                        {isSupplier && d.status === "ORDERED" && (
                          <button onClick={() => setDispatchModal({ isOpen: true, delivery: d, confirmedPrice: String(d.agreedPricePerLiter) })} className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-lg text-[10px] uppercase tracking-widest font-black shadow-md transition-all active:scale-95">
                            Confirm & Dispatch
                          </button>
                        )}
                        {isSupplier && d.status !== "ORDERED" && <span className="text-xs font-bold text-slate-400">{d.status === "CANCELLED" ? "Cancelled" : "Processed"}</span>}

                        {/* BOTH: cancel / decline before dispatch */}
                        {(isSupervisor || isSupplier) && d.status === "ORDERED" && (
                          <button onClick={() => setCancelModal({ delivery: d, reason: "" })} className="px-3 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-[10px] uppercase tracking-widest font-black">
                            {isSupervisor ? "Cancel" : "Decline"}
                          </button>
                        )}

                        {/* SUPERVISOR ACTIONS */}
                        {isSupervisor && d.status === "DISPATCHED" && (
                          <button onClick={() => setReceiveModal({ isOpen: true, delivery: d, litersReceived: String(d.litersOrdered), newPumpPrice: "", deliveryNote: "", vehicleNumber: "" })} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] uppercase tracking-widest font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                            Mark Received
                          </button>
                        )}
                        {seesAll && d.status === "ORDERED" && <span className="self-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Awaiting Supplier</span>}
                        {seesAll && d.status === "RECEIVED" && (
                          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 justify-end">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                            Tank Topped Up
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {deliveries.length === 0 && (
                  <tr><td colSpan={seesAll ? 6 : 5} className="text-center py-16 text-slate-500 font-medium">No fuel deliveries found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SUPERVISOR: REQUEST NEW DELIVERY MODAL */}
      {orderModal.isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-6">Request Fuel Delivery</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase mb-2">Fuel Type</label>
                <select value={orderModal.fuelType} onChange={(e) => setOrderModal({ ...orderModal, fuelType: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 font-bold text-slate-800 cursor-pointer">
                  <option value="">-- Select Fuel Type --</option>
                  {tanks.map((t) => (<option key={t.tankId} value={t.fuelType}>{t.fuelType}</option>))}
                </select>
                {tanks.length === 0 && <p className="text-[10px] font-bold text-amber-600 mt-1.5">No tanks found — create a tank on the Dashboard first.</p>}
                {orderSpace && (
                  <p className={`text-[11px] font-bold mt-1.5 ${orderTooBig ? "text-red-600" : "text-slate-500"}`}>
                    {Math.round(orderSpace.free).toLocaleString()} L free
                    {orderSpace.onOrder > 0 && `, ${Math.round(orderSpace.onOrder).toLocaleString()} L already on order`}
                    {" "}— you can order up to {Math.floor(orderSpace.available).toLocaleString()} L.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase mb-2">Target Supplier</label>
                <select value={orderModal.supplierId} onChange={(e) => setOrderModal({ ...orderModal, supplierId: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 font-bold text-slate-800 cursor-pointer">
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.companyName} ({s.supplierCode})</option>))}
                </select>
                {suppliers.length === 0 && <p className="text-[10px] font-bold text-amber-600 mt-1.5">No active fuel suppliers. Finance adds suppliers and approves them for fuel.</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-600 uppercase mb-2">Liters Ordered</label>
                  <input type="number" min="1" value={orderModal.litersOrdered} onChange={(e) => setOrderModal({ ...orderModal, litersOrdered: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-black text-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-600 uppercase mb-2">Target Price / L</label>
                  <input type="number" step="0.01" value={orderModal.targetPrice} onChange={(e) => setOrderModal({ ...orderModal, targetPrice: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-black text-slate-900" />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">The supplier confirms their real price when they dispatch — this is only a starting estimate.</p>
              <div className="p-4 bg-slate-900 rounded-xl text-white flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Estimated Value</span>
                <span className="font-black text-lg">{formatLKR((parseFloat(orderModal.litersOrdered) || 0) * (parseFloat(orderModal.targetPrice) || 0))}</span>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setOrderModal({ isOpen: false, fuelType: "", supplierId: "", litersOrdered: "", targetPrice: "" })} disabled={isSubmittingAction} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-60">Cancel</button>
              <button onClick={executePlaceOrder} disabled={isSubmittingAction || orderTooBig} className="flex-1 px-4 py-3 rounded-xl font-black text-white bg-blue-600 hover:bg-blue-700 shadow-md disabled:opacity-60">
                {isSubmittingAction ? "Sending..." : "Send Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPPLIER: CONFIRM PRICE & DISPATCH MODAL */}
      {dispatchModal.isOpen && dispatchModal.delivery && (
        <div className="fixed inset-0 z-[70] flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-1">Confirm Your Price</h3>
            <p className="text-xs font-bold text-slate-500 mb-6 uppercase tracking-widest">{dispatchModal.delivery.fuelType} • {dispatchModal.delivery.litersOrdered}L</p>
            <p className="text-sm text-slate-600 font-medium mb-4">
              Lanka Auto Care estimated <span className="font-bold text-slate-900">{formatLKR(dispatchModal.delivery.agreedPricePerLiter)}</span> per liter when placing this order.
              Confirm it, or enter today&apos;s real price below — fuel prices move daily, and this becomes what you&apos;re invoiced at.
            </p>
            <label className="block text-xs font-black text-slate-600 uppercase mb-2">Your Confirmed Price / Liter (LKR)</label>
            <input type="number" step="0.01" autoFocus value={dispatchModal.confirmedPrice} onChange={(e) => setDispatchModal({ ...dispatchModal, confirmedPrice: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 font-black text-slate-900 mb-6" />
            <div className="flex gap-3">
              <button onClick={() => setDispatchModal({ isOpen: false, delivery: null, confirmedPrice: "" })} disabled={isSubmittingAction} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-60">Cancel</button>
              <button onClick={executeDispatch} disabled={isSubmittingAction} className="flex-1 px-4 py-3 rounded-xl font-black text-white bg-slate-900 hover:bg-blue-600 shadow-md disabled:opacity-60">
                {isSubmittingAction ? "Confirming..." : "Confirm & Dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPERVISOR: RECEIVE + MEASURE + OPTIONAL PUMP PRICE MODAL */}
      {receiveModal.isOpen && receiveModal.delivery && (
        <div className="fixed inset-0 z-[70] flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-1">Receive Bowser Delivery</h3>
            <p className="text-xs font-bold text-slate-500 mb-6 uppercase tracking-widest">{receiveModal.delivery.fuelType} • Ordered {receiveModal.delivery.litersOrdered}L</p>

            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl mb-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Confirmed cost paid</span>
                <span className="font-black text-slate-900">{formatLKR(receiveModal.delivery.agreedPricePerLiter)} / L</span>
              </div>
              {receiveModal.delivery.orderedPricePerLiter != null
                && Math.abs(receiveModal.delivery.orderedPricePerLiter - receiveModal.delivery.agreedPricePerLiter) > 0.005 && (
                <p className="text-[11px] font-bold text-amber-700">
                  Supplier changed the price from {formatLKR(receiveModal.delivery.orderedPricePerLiter)} at dispatch — check it before accepting.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase mb-2">Delivery Note No.</label>
                <input type="text" value={receiveModal.deliveryNote} onChange={(e) => setReceiveModal({ ...receiveModal, deliveryNote: e.target.value })} placeholder="From supplier's paperwork" className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-emerald-500 font-bold text-slate-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase mb-2">Bowser No. (optional)</label>
                <input type="text" value={receiveModal.vehicleNumber} onChange={(e) => setReceiveModal({ ...receiveModal, vehicleNumber: e.target.value })} placeholder="e.g. LB-1234" className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-emerald-500 font-bold text-slate-900 text-sm uppercase" />
              </div>
            </div>

            <label className="block text-xs font-black text-slate-600 uppercase mb-2">Dip-Measured Liters Received</label>
            <p className="text-[11px] text-slate-400 font-medium mb-2">Enter what was actually measured — this may differ slightly from what was ordered.</p>
            <input type="number" step="0.01" autoFocus value={receiveModal.litersReceived} onChange={(e) => setReceiveModal({ ...receiveModal, litersReceived: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-emerald-500 font-black text-slate-900 mb-4" />

            <label className="block text-xs font-black text-slate-600 uppercase mb-2">New Pump Price (optional)</label>
            <p className="text-[11px] text-slate-400 font-medium mb-2">Leave blank to keep the current pump price unchanged.</p>
            <input type="number" step="0.01" placeholder="e.g. new price per liter at the pump" value={receiveModal.newPumpPrice} onChange={(e) => setReceiveModal({ ...receiveModal, newPumpPrice: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-emerald-500 font-black text-slate-900 mb-6" />

            <div className="flex gap-3">
              <button onClick={() => setReceiveModal({ isOpen: false, delivery: null, litersReceived: "", newPumpPrice: "", deliveryNote: "", vehicleNumber: "" })} disabled={isSubmittingAction} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-60">Cancel</button>
              <button onClick={executeReceive} disabled={isSubmittingAction} className="flex-1 px-4 py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-md disabled:opacity-60">
                {isSubmittingAction ? "Processing..." : "Confirm Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL / DECLINE MODAL */}
      {cancelModal && (
        <div className="fixed inset-0 z-[70] flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-1">{isSupervisor ? "Cancel Order" : "Decline Order"}</h3>
            <p className="text-xs font-bold text-slate-500 mb-6 uppercase tracking-widest">
              FD-{cancelModal.delivery.id.toString().padStart(5, "0")} · {cancelModal.delivery.fuelType} · {cancelModal.delivery.litersOrdered}L
            </p>
            <label className="block text-xs font-black text-slate-600 uppercase mb-2">Reason</label>
            <textarea rows={3} autoFocus value={cancelModal.reason} onChange={(e) => setCancelModal({ ...cancelModal, reason: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-red-400 text-sm font-medium mb-1" />
            <p className="text-[10px] font-bold text-slate-400 mb-6">At least 5 characters. Recorded in the audit log.</p>
            <div className="flex gap-3">
              <button onClick={() => setCancelModal(null)} disabled={isSubmittingAction} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-60">Back</button>
              <button onClick={executeCancel} disabled={isSubmittingAction || cancelModal.reason.trim().length < 5} className="flex-1 px-4 py-3 rounded-xl font-black text-white bg-red-600 hover:bg-red-700 shadow-md disabled:opacity-50">
                {isSubmittingAction ? "Cancelling..." : isSupervisor ? "Cancel Order" : "Decline Order"}
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
