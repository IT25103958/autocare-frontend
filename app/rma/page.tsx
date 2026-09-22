"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import Link from "next/link";

interface RMARecord {
  id: number;
  partName: string;
  partCode: string;
  quantity: number;
  reason: string;
  supplierName: string;
  totalValue: number;
  status: string;
  financialStatus: string;
  dateLogged: string;
}

export default function MasterRMADashboard() {
  const { user } = useAuth();
  const [rmas, setRmas] = useState<RMARecord[]>([]);
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });

  const isSupplier = user?.role === "SUPPLIER";
  const isFinance = user?.role === "ACCOUNTS_FINANCE_OFFICER" || user?.role === "SUPER_ADMIN";
  const isInventory = user?.role === "INVENTORY_MANAGER";

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` }
  });

  const fetchRmas = async () => {
    try {
      const response = await axios.get("http://localhost:8080/api/rma", getAuthHeader());
      let fetchedRmas = response.data;

      if (user?.role === "SUPPLIER") {
         const myName = user.fullName || user.username;
         fetchedRmas = fetchedRmas.filter((r: RMARecord) => r.supplierName === myName);
      }

      setRmas(fetchedRmas.sort((a: RMARecord, b: RMARecord) => b.id - a.id));
    } catch (err) {
      console.error("Failed to fetch RMA records", err);
    }
  };

  useEffect(() => {
    if (user) fetchRmas();
  }, [user]);

  const handleProcessRMA = async (id: number, status: "APPROVED_REPLACEMENT" | "APPROVED_REFUND" | "REJECTED") => {
    setServerMessage({ type: "", text: "" });
    try {
      await axios.put(`http://localhost:8080/api/rma/${id}/process?status=${status}`, {}, getAuthHeader());
      setServerMessage({ type: "success", text: `RMA #${id} successfully updated to ${status.replace('_', ' ')}.` });
      fetchRmas();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } catch (err) {
      setServerMessage({ type: "error", text: "Failed to update RMA status." });
    }
  };

  const handleReceiveReplacement = async (id: number) => {
    setServerMessage({ type: "", text: "" });
    try {
      await axios.put(`http://localhost:8080/api/rma/${id}/receive-replacement`, {}, getAuthHeader());
      setServerMessage({ type: "success", text: "Physical replacement verified. The live catalog stock has been incremented." });
      fetchRmas();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 4000);
    } catch (err) {
      setServerMessage({ type: "error", text: "Failed to process the physical replacement." });
    }
  };

  const formatLKR = (amount: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12 relative">
      <div className="max-w-7xl mx-auto">

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">
              {isSupplier ? "Warranty & Returns (RMA)" : isFinance ? "RMA Financial Ledger" : "RMA Dispatch Hub"}
            </h1>
            <p className="text-slate-500 font-medium mt-2">
              {isSupplier && "Review defective parts returned by Lanka Auto Care and authorize replacements or refunds."}
              {isFinance && "Monitor authorized supplier refunds. Settlement processing is handled in the Payables dashboard."}
              {isInventory && "Track defective shipments and inject verified physical replacements back into the catalog."}
            </p>
          </div>
          {isFinance && (
            <Link href="/payables" className="px-6 py-3 bg-slate-900 text-white hover:bg-emerald-600 font-bold rounded-xl shadow-lg transition-all text-sm flex items-center gap-2">
              Go to Payables to Settle Funds &rarr;
            </Link>
          )}
        </div>

        {isSupplier && rmas.filter(r => r.status === "PENDING").length > 0 && (
          <div className="mb-8 p-6 bg-orange-50 border border-orange-200 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between shadow-sm animate-fade-in-up gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 shrink-0">
                <svg className="w-7 h-7 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div>
                <h3 className="font-black text-orange-900 text-xl tracking-tight">Action Required: Pending Returns</h3>
                <p className="text-sm font-bold text-orange-700 mt-1">Lanka Auto Care has filed <span className="text-orange-900 font-black">{rmas.filter(r => r.status === "PENDING").length}</span> RMA ticket(s) awaiting your authorization.</p>
              </div>
            </div>
            <button onClick={() => window.scrollTo({ top: 500, behavior: 'smooth' })} className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl text-sm transition-all shadow-lg shadow-orange-600/30 active:scale-95 whitespace-nowrap uppercase tracking-widest">
              Review Tickets
            </button>
          </div>
        )}

        {serverMessage.text && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-bold animate-fade-in-up flex items-center gap-3 ${serverMessage.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {serverMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                 {isSupplier ? "Action Required" : "Pending Supplier Review"}
               </h3>
               <div className="text-4xl font-black text-slate-900 tracking-tight mb-1">
                 {rmas.filter(r => r.status === "PENDING").length}
               </div>
               <p className="text-xs font-bold text-orange-500">Awaiting authorization</p>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Logged RMAs</h3>
               <div className="text-4xl font-black text-slate-900 tracking-tight mb-1">
                 {rmas.length}
               </div>
               <p className="text-xs font-bold text-blue-600">Database Synchronized</p>
            </div>
          </div>

          <div className="lg:col-span-3 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 h-full">
              <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                 <h3 className="text-xl font-bold text-slate-800">Return Authorizations</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="pb-4 pr-4">RMA Ref</th>
                      <th className="pb-4 pr-4">Part / Supplier</th>
                      <th className="pb-4 pr-4">Value</th>
                      <th className="pb-4 text-right">Logistics Status</th>
                      {isFinance && <th className="pb-4 text-right">Financial Status</th>}
                      {isSupplier && <th className="pb-4 text-right">Supplier Actions</th>}
                      {isInventory && <th className="pb-4 text-right">Inventory Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700">
                    {rmas.map((rma) => (
                      <tr key={rma.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="py-5 pr-4">
                          <p className="text-slate-900 font-bold font-mono">RMA-{rma.id.toString().padStart(4, '0')}</p>
                          <p className="text-[10px] text-slate-400 font-bold tracking-wider mt-0.5">{new Date(rma.dateLogged).toLocaleDateString()}</p>
                        </td>
                        <td className="py-5 pr-4">
                          <p className="font-bold text-slate-800">{rma.partName} <span className="text-xs text-slate-500 font-normal">x{rma.quantity}</span></p>
                          <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider mt-0.5">{rma.supplierName}</p>
                        </td>
                        <td className="py-5 pr-4">
                          <span className="font-black text-slate-900">{formatLKR(rma.totalValue)}</span>
                        </td>

                        <td className="py-5 text-right">
                           <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[9px] font-black tracking-widest uppercase border ${
                              rma.status.includes('APPROVED') || rma.status.includes('RECEIVED') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              rma.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' :
                              'bg-orange-50 text-orange-700 border-orange-200'
                            }`}>
                              {rma.status.replace('_', ' ')}
                            </span>
                        </td>

                        {isFinance && (
                          <td className="py-5 text-right">
                             <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[9px] font-black tracking-widest uppercase border ${
                                rma.financialStatus === 'SETTLED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                                {rma.financialStatus}
                              </span>
                          </td>
                        )}

                        {isSupplier && (
                          <td className="py-5 text-right">
                            {rma.status === "PENDING" ? (
                              <div className="flex justify-end gap-2">
                                <button onClick={() => handleProcessRMA(rma.id, "REJECTED")} className="px-3 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold rounded-lg shadow-sm transition-colors text-[10px] uppercase tracking-wider">
                                  Reject
                                </button>
                                <button onClick={() => handleProcessRMA(rma.id, "APPROVED_REPLACEMENT")} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 font-bold rounded-lg shadow-sm transition-colors text-[10px] uppercase tracking-wider">
                                  Approve Replace
                                </button>
                                <button onClick={() => handleProcessRMA(rma.id, "APPROVED_REFUND")} className="px-3 py-1.5 bg-slate-900 hover:bg-emerald-600 text-white font-bold rounded-lg shadow-sm transition-colors text-[10px] uppercase tracking-wider">
                                  Approve Refund
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pr-2">Processed</span>
                            )}
                          </td>
                        )}

                        {isInventory && (
                          <td className="py-5 text-right">
                            {rma.status === "APPROVED_REPLACEMENT" ? (
                              <button onClick={() => handleReceiveReplacement(rma.id)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-colors text-[10px] uppercase tracking-wider flex items-center justify-end gap-1.5 ml-auto">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                                Receive Stock
                              </button>
                            ) : rma.status === "REPLACEMENT_RECEIVED" ? (
                              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest pr-2 flex items-center justify-end gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                                Stock Restored
                              </span>
                            ) : rma.status === "APPROVED_REFUND" ? (
                              <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest pr-2">Sent to Finance</span>
                            ) : rma.status === "REJECTED" ? (
                              <span className="text-[10px] font-black text-red-600 uppercase tracking-widest pr-2">Stock Written Off</span>
                            ) : (
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pr-2">Awaiting Supplier</span>
                            )}
                          </td>
                        )}

                      </tr>
                    ))}
                    {rmas.length === 0 && (
                      <tr>
                        <td colSpan={isInventory || isSupplier || isFinance ? 7 : 6} className="text-center py-12 text-slate-500 font-medium">
                          No active warranty returns or claims found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in-up { animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }`}} />
    </div>
  );
}