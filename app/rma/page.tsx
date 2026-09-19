"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

interface RMARecord {
  id: number;
  partName: string;
  partCode: string;
  quantity: number;
  reason: string;
  status: string; // "PENDING", "APPROVED_REPLACEMENT", "REJECTED"
  dateLogged: string;
}

export default function SupplierRMADashboard() {
  const { user } = useAuth();
  const [rmas, setRmas] = useState<RMARecord[]>([]);
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` }
  });

  // --- FETCH RMAS FROM BACKEND ---
  const fetchRmas = async () => {
    try {
      const response = await axios.get("http://localhost:8080/api/rma", getAuthHeader());
      setRmas(response.data);
    } catch (err) {
      console.error("Failed to fetch RMA records", err);
    }
  };

  useEffect(() => {
    fetchRmas();
  }, []);

  // --- PROCESS RMA (APPROVE / REJECT) ---
  const handleProcessRMA = async (id: number, status: "APPROVED_REPLACEMENT" | "REJECTED") => {
    setServerMessage({ type: "", text: "" });
    try {
      await axios.put(`http://localhost:8080/api/rma/${id}/process?status=${status}`, {}, getAuthHeader());

      setServerMessage({ type: "success", text: `RMA #${id} successfully updated to ${status.replace('_', ' ')}.` });
      fetchRmas(); // Refresh table data

      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } catch (err) {
      console.error("Failed to process RMA", err);
      setServerMessage({ type: "error", text: "Failed to update RMA status." });
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12">
      <div className="max-w-7xl mx-auto">

        {/* --- HEADER --- */}
        <div className="mb-10 animate-fade-in-up">
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Warranty & Returns (RMA)</h1>
          <p className="text-slate-500 font-medium mt-2">
            Review defective parts returned by Lanka Auto Care and authorize replacements.
          </p>
        </div>

        {/* --- STATUS BANNER --- */}
        {serverMessage.text && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-bold animate-fade-in-up flex items-center gap-3 ${serverMessage.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {serverMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

          {/* --- LEFT: QUICK STATS --- */}
          <div className="lg:col-span-1 space-y-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Pending Reviews</h3>
               <div className="text-4xl font-black text-slate-900 tracking-tight mb-1">
                 {rmas.filter(r => r.status === "PENDING").length}
               </div>
               <p className="text-xs font-bold text-red-500">Requires your attention</p>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Logged RMAs</h3>
               <div className="text-4xl font-black text-slate-900 tracking-tight mb-1">
                 {rmas.length}
               </div>
               <p className="text-xs font-bold text-blue-600">Database Synchronized</p>
            </div>
          </div>

          {/* --- RIGHT: RMA LEDGER TABLE --- */}
          <div className="lg:col-span-3 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 h-full">
              <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                 <h3 className="text-xl font-bold text-slate-800">Return Authorizations</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <th className="pb-3 pr-4">RMA / Date</th>
                      <th className="pb-3 pr-4">Part Details</th>
                      <th className="pb-3 pr-4 text-center">Qty</th>
                      <th className="pb-3 pr-4">Reason</th>
                      <th className="pb-3 text-right">Status / Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700">
                    {rmas.map((rma) => (
                      <tr key={rma.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="py-5 pr-4">
                          <p className="text-slate-900 font-bold font-mono">RMA-{rma.id.toString().padStart(5, '0')}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{rma.dateLogged ? new Date(rma.dateLogged).toLocaleDateString() : 'N/A'}</p>
                        </td>
                        <td className="py-5 pr-4">
                          <p className="font-bold text-slate-800">{rma.partName}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">{rma.partCode}</p>
                        </td>
                        <td className="py-5 pr-4 text-center font-black text-slate-900">
                          {rma.quantity}
                        </td>
                        <td className="py-5 pr-4 text-slate-600 whitespace-normal min-w-[200px]">
                          {rma.reason}
                        </td>
                        <td className="py-5 text-right">
                          {rma.status === "PENDING" ? (
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleProcessRMA(rma.id, "REJECTED")}
                                className="px-3 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold rounded-lg shadow-sm transition-colors text-xs"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => handleProcessRMA(rma.id, "APPROVED_REPLACEMENT")}
                                className="px-3 py-1.5 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-lg shadow-sm transition-colors text-xs"
                              >
                                Approve Replace
                              </button>
                            </div>
                          ) : (
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest uppercase ${
                              rma.status === 'APPROVED_REPLACEMENT' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                              {rma.status.replace('_', ' ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rmas.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-slate-500 font-medium">
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
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
      `}} />
    </div>
  );
}