"use client";

import { useState, useEffect } from "react";
import axios from "axios";
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

  const isManager = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "INVENTORY_MANAGER";

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  const fetchOrders = async () => {
    try {
      const res = await axios.get("http://localhost:8080/api/supply", getAuthHeader());
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

  // SUPPLIER ACTION: Fulfill and Dispatch
  const handleDispatch = async (id: number) => {
    try {
      await axios.put(`http://localhost:8080/api/supply/${id}/dispatch`, {}, getAuthHeader());
      setModal({ isOpen: true, type: "success", title: "Order Dispatched", message: "Lanka Auto Care has been notified that the parts are en route." });
      fetchOrders();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Action Failed", message: "Could not update the dispatch status." });
    }
  };

  // MANAGER ACTION: Receive & Trigger Automation
  const handleReceive = async (id: number) => {
    try {
      await axios.put(`http://localhost:8080/api/supply/${id}/receive`, {}, getAuthHeader());
      setModal({
        isOpen: true,
        type: "success",
        title: "Stock Injected Successfully",
        message: "Physical goods verified. Live inventory has been incremented, and an UNPAID invoice has been auto-generated in the Payables ledger for Finance."
      });
      fetchOrders();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Receiving Failed", message: "Could not process the stock injection." });
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
                          <button onClick={() => handleDispatch(order.id)} className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-lg text-[10px] uppercase tracking-widest font-black shadow-md transition-all active:scale-95">
                            Dispatch Order
                          </button>
                        )}
                        {!isManager && order.status !== 'PENDING_DISPATCH' && (
                          <span className="text-xs font-bold text-slate-400">Processed</span>
                        )}

                        {/* MANAGER ACTIONS */}
                        {isManager && order.status === 'DISPATCHED' && (
                          <button onClick={() => handleReceive(order.id)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] uppercase tracking-widest font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5">
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

      {/* Global Alert Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
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