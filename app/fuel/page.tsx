"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../context/AuthContext";

// 1. SCHEMA FIX: We removed 'totalCost' because the backend handles it securely now.
const fuelSaleSchema = z.object({
  fuelType: z.enum(["Petrol 92", "Petrol 95", "Super Diesel", "Auto Diesel"]),
  pumpNumber: z.coerce.number().min(1, "Pump number is required."),
  litersPumped: z.coerce.number().min(0.1, "Liters must be greater than 0."),
});

type FuelSaleFormInputs = z.infer<typeof fuelSaleSchema>;

interface FuelSale {
  saleId: number;
  fuelType: string;
  pumpNumber: number;
  litersPumped: number;
  totalCost: number;
  saleDate: string;
  attendantName?: string;
}

interface FuelTank {
  tankId: number;
  fuelType: string;
  pricePerLiter: number; // NEW: Backend pricing truth
}

export default function FuelPosPage() {
  const { user } = useAuth();

  const isSupervisor = user?.role === "FUEL_STATION_SUPERVISOR" || user?.role === "SUPER_ADMIN" || user?.role === "EXECUTIVE_OWNER";

  const [sales, setSales] = useState<FuelSale[]>([]);
  const [tanks, setTanks] = useState<FuelTank[]>([]);
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });
  const [isMounted, setIsMounted] = useState(false);

  // 2. VOID FIX: Added a mandatory reason state for the audit log
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; saleId: number | null; reason: string }>({
    isOpen: false,
    saleId: null,
    reason: ""
  });

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FuelSaleFormInputs>({
    resolver: zodResolver(fuelSaleSchema),
    defaultValues: { fuelType: "Petrol 92" }
  });

  // Watch inputs for live price calculation
  const selectedFuel = watch("fuelType");
  const pumpedVolume = parseFloat(watch("litersPumped") as any) || 0;

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` }
  });

  const fetchData = async () => {
    try {
      const [salesRes, tanksRes] = await Promise.all([
        axios.get("http://localhost:8080/api/fuel", getAuthHeader()).catch(() => ({ data: [] })),
        axios.get("http://localhost:8080/api/tanks", getAuthHeader()).catch(() => ({ data: [] }))
      ]);

      if (salesRes.data) {
        const filteredSales = isSupervisor
          ? salesRes.data
          : salesRes.data.filter((s: FuelSale) => s.attendantName === user?.username);

        setSales(filteredSales.sort((a: FuelSale, b: FuelSale) => b.saleId - a.saleId));
      }

      if (tanksRes.data) {
        setTanks(tanksRes.data);
      }
    } catch (err) {
      console.error("Failed to fetch fuel POS data");
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const onSubmit = async (data: FuelSaleFormInputs) => {
    setServerMessage({ type: "", text: "" });
    try {
      // We only send fuelType, pumpNumber, and litersPumped. Backend calculates cost.
      const response = await axios.post("http://localhost:8080/api/fuel/sell", data, getAuthHeader());
      setServerMessage({ type: "success", text: `Success! Transaction #${response.data.saleId} recorded.` });
      reset();
      fetchData();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } catch (err: any) {
      const errorMsg = err.response?.data || "Transaction failed.";
      setServerMessage({ type: "error", text: errorMsg });
    }
  };

  const openDeleteModal = (saleId: number) => {
    setDeleteModal({ isOpen: true, saleId, reason: "" });
  };

  const executeDelete = async () => {
    if (!deleteModal.saleId) return;
    if (deleteModal.reason.trim().length < 5) {
      alert("A detailed reason is required for the audit log.");
      return;
    }

    try {
      // 3. AUDIT FIX: Pass the reason as a query parameter
      await axios.delete(`http://localhost:8080/api/fuel/${deleteModal.saleId}?reason=${encodeURIComponent(deleteModal.reason)}`, getAuthHeader());
      setServerMessage({ type: "success", text: "Transaction voided and logged to audit trail." });
      fetchData();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } catch (err) {
      setServerMessage({ type: "error", text: "Failed to void transaction." });
      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } finally {
      setDeleteModal({ isOpen: false, saleId: null, reason: "" });
    }
  };

  // Calculate Live Total for UI
  const activeTank = tanks.find(t => t.fuelType === selectedFuel);
  const livePricePerLiter = activeTank ? activeTank.pricePerLiter : 0;
  const estimatedTotal = pumpedVolume * livePricePerLiter;

  if (!isMounted) return null;

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] relative animate-fade-in-up">

      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Fuel Station POS</h1>
          <p className="text-slate-500 font-medium mt-1">Process live pump sales and maintain ledger.</p>
        </div>
        <div className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border ${isSupervisor ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-200 text-slate-600 border-slate-300'}`}>
          {isSupervisor ? 'Manager Mode Active' : 'Attendant POS Mode'}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* --- LEFT: LOG SALE FORM --- */}
        <div className="xl:col-span-1">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 sticky top-6">
            <h2 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Record Sale</h2>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Pump No.</label>
                  <input
                    {...register("pumpNumber")}
                    type="number"
                    placeholder="e.g., 3"
                    className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${errors.pumpNumber ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Fuel Type</label>
                  <select
                    {...register("fuelType")}
                    className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${errors.fuelType ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"}`}
                  >
                    <option value="Petrol 92">Petrol 92</option>
                    <option value="Petrol 95">Petrol 95</option>
                    <option value="Auto Diesel">Auto Diesel</option>
                    <option value="Super Diesel">Super Diesel</option>
                  </select>
                </div>
              </div>
              {errors.pumpNumber && <p className="mt-1 text-xs font-bold text-red-500">{errors.pumpNumber.message}</p>}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Liters Pumped</label>
                <input
                  {...register("litersPumped")}
                  type="number"
                  step="0.01"
                  placeholder="e.g., 20.5"
                  className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all font-black text-blue-700 ${errors.litersPumped ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"}`}
                />
                {errors.litersPumped && <p className="mt-1 text-xs font-bold text-red-500">{errors.litersPumped.message}</p>}
              </div>

              {/* LIVE PRICING DISPLAY (Replaces the manual input) */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 mt-6 shadow-xl">
                <div className="flex justify-between text-sm mb-2 font-medium">
                  <span className="text-slate-400">Current Unit Price</span>
                  <span>Rs. {livePricePerLiter.toLocaleString(undefined, { minimumFractionDigits: 2 })} / L</span>
                </div>
                <div className="flex justify-between text-xl font-black border-t border-slate-700 pt-3 mt-1">
                  <span>Charge Customer</span>
                  <span className="text-emerald-400">
                    Rs. {estimatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-4 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-70 mt-6 uppercase tracking-widest text-xs">
                {isSubmitting ? "Processing..." : "Process Transaction"}
              </button>

              {serverMessage.text && (
                <div className={`mt-4 p-3 rounded-xl text-sm font-bold text-center ${serverMessage.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {serverMessage.text}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* --- RIGHT: RECENT TRANSACTIONS TABLE --- */}
        <div className="xl:col-span-2">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-full">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-xl font-bold text-slate-800">Recent Pump Activity</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="pb-4 pr-4">ID / Time</th>
                    <th className="pb-4 pr-4">Fuel & Pump</th>
                    <th className="pb-4 pr-4">Attendant</th>
                    <th className="pb-4 pr-4 text-right">Liters</th>
                    <th className="pb-4 pr-4 text-right">Revenue</th>
                    {isSupervisor && <th className="pb-4 text-right">Manager Actions</th>}
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-slate-700">
                  {sales.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-500 font-medium">
                        <div className="text-4xl mb-4">⛽</div>
                        <p className="text-slate-500 font-medium">No sales recorded yet.</p>
                      </td>
                    </tr>
                  ) : (
                    sales.map((s) => (
                      <tr key={s.saleId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 pr-4">
                          <p className="text-slate-900 font-bold font-mono">TXN-{s.saleId.toString().padStart(5, '0')}</p>
                          <p className="text-[10px] font-black text-slate-400 mt-0.5 tracking-wider uppercase">
                            {s.saleDate ? new Date(s.saleDate).toLocaleTimeString() : 'N/A'}
                          </p>
                        </td>
                        <td className="py-4 pr-4">
                          <p className="font-bold text-slate-800">Pump {s.pumpNumber}</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase bg-slate-100 text-slate-500 mt-1">
                            {s.fuelType}
                          </span>
                        </td>
                        <td className="py-4 pr-4">
                           <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                             {s.attendantName || 'System'}
                           </span>
                        </td>
                        <td className="py-4 pr-4 text-right font-medium">
                          {s.litersPumped.toFixed(2)} L
                        </td>
                        <td className="py-4 pr-4 text-right font-black text-emerald-600">
                          Rs. {s.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {isSupervisor && (
                          <td className="py-4 text-right">
                            <button
                              onClick={() => openDeleteModal(s.saleId)}
                              className="text-[9px] font-black tracking-widest uppercase text-red-500 hover:text-white bg-red-50 hover:bg-red-500 border border-red-100 px-3 py-1.5 rounded-md transition-colors"
                            >
                              Void
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* --- SECURE VOID MODAL --- */}
      {deleteModal.isOpen && isSupervisor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4 mx-auto">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-center text-slate-900 mb-2 tracking-tight">Void Transaction</h3>
            <p className="text-slate-500 text-xs text-center mb-6 font-medium">
              You are about to reverse a financial transaction. A reason is required for the central audit log.
            </p>

            <div className="mb-6">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Reason for Void</label>
              <input
                type="text"
                placeholder="e.g., Pump malfunction, Typo by attendant"
                value={deleteModal.reason}
                onChange={(e) => setDeleteModal({...deleteModal, reason: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-red-500 font-medium text-sm"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setDeleteModal({ isOpen: false, saleId: null, reason: "" })} className="flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={executeDelete}
                disabled={deleteModal.reason.trim().length < 5}
                className="flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 shadow-md shadow-red-600/20 transition-all active:scale-95"
              >
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}