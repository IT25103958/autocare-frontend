"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const fuelSaleSchema = z.object({
  fuelType: z.enum(["Petrol 92", "Petrol 95", "Super Diesel", "Auto Diesel"]),
  pumpNumber: z.coerce.number().min(1, "Pump number is required."),
  litersPumped: z.coerce.number().min(0.1, "Liters must be greater than 0."),
  totalCost: z.coerce.number().min(1, "Total amount must be greater than 0."),
});

type FuelSaleFormInputs = z.infer<typeof fuelSaleSchema>;

interface FuelTank {
  tankId: number;
  fuelType: string;
  capacity: number;
  currentStock: number;
}

interface FuelSale {
  saleId: number;
  fuelType: string;
  pumpNumber: number;
  litersPumped: number;
  totalCost: number;
  saleDate: string;
}

export default function FuelSalesDashboard() {
  const [tanks, setTanks] = useState<FuelTank[]>([]);
  const [sales, setSales] = useState<FuelSale[]>([]);
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });
  const [isMounted, setIsMounted] = useState(false);

  // NEW: State for the custom confirmation modal
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; saleId: number | null }>({
    isOpen: false,
    saleId: null,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FuelSaleFormInputs>({
    resolver: zodResolver(fuelSaleSchema),
    defaultValues: { fuelType: "Petrol 92" }
  });

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` }
  });

  const fetchData = async () => {
    try {
      const [tanksRes, salesRes] = await Promise.all([
        axios.get("http://localhost:8080/api/tanks", getAuthHeader()),
        axios.get("http://localhost:8080/api/fuel", getAuthHeader())
      ]);
      setTanks(tanksRes.data);
      setSales(salesRes.data.sort((a: FuelSale, b: FuelSale) => b.saleId - a.saleId));
    } catch (err) {
      console.error("Failed to fetch fuel data", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const onSubmit = async (data: FuelSaleFormInputs) => {
    setServerMessage({ type: "", text: "" });
    try {
      const response = await axios.post("http://localhost:8080/api/fuel/sell", data, getAuthHeader());
      setServerMessage({ type: "success", text: `Success! Transaction #${response.data.saleId} recorded.` });
      reset();
      fetchData();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } catch (err: any) {
      console.error(err);
      const errorMsg = err.response?.data || "Transaction failed.";
      setServerMessage({ type: "error", text: errorMsg });
    }
  };

  // NEW: Opens the UI Modal instead of browser alert
  const openDeleteModal = (saleId: number) => {
    setDeleteModal({ isOpen: true, saleId });
  };

  // NEW: Executes the delete when confirmed in the modal
  const executeDelete = async () => {
    if (!deleteModal.saleId) return;

    try {
      await axios.delete(`http://localhost:8080/api/fuel/${deleteModal.saleId}`, getAuthHeader());
      setServerMessage({ type: "success", text: "Transaction voided. Fuel returned to master tank." });
      fetchData();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } catch (err) {
      console.error("Failed to delete sale", err);
      setServerMessage({ type: "error", text: "Failed to void transaction." });
      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } finally {
      setDeleteModal({ isOpen: false, saleId: null });
    }
  };

  if (!isMounted) return null;

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] relative">

      {/* --- DASHBOARD HEADER --- */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Fuel Station Console</h1>
        <p className="text-slate-500 font-medium mt-1">Live tank monitoring and point-of-sale management.</p>
      </div>

      {/* --- LIVE TANK MONITORS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        {tanks.map((tank) => {
          const percentage = (tank.currentStock / tank.capacity) * 100;
          const isLow = percentage <= 20;

          return (
            <div key={tank.tankId} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-800">{tank.fuelType}</h3>
                {isLow && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
              </div>

              <div className="text-2xl font-black text-slate-900 mb-1">
                {tank.currentStock.toLocaleString()} <span className="text-sm text-slate-400 font-medium">L</span>
              </div>
              <p className="text-xs text-slate-500 mb-4">of {tank.capacity.toLocaleString()} L Capacity</p>

              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all duration-1000 ${isLow ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        {/* --- LEFT: LOG SALE FORM --- */}
        <div className="xl:col-span-1">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Record Sale</h2>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Pump No.</label>
                  <input
                    {...register("pumpNumber")}
                    type="number"
                    placeholder="e.g., 3"
                    className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${
                      errors.pumpNumber ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Fuel Type</label>
                  <select
                    {...register("fuelType")}
                    className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${
                      errors.fuelType ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
                    }`}
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
                  className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${
                    errors.litersPumped ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
                  }`}
                />
                {errors.litersPumped && <p className="mt-1 text-xs font-bold text-red-500">{errors.litersPumped.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Total Amount (LKR)</label>
                <input
                  {...register("totalCost")}
                  type="number"
                  step="0.01"
                  placeholder="e.g., 7500.00"
                  className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${
                    errors.totalCost ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
                  }`}
                />
                {errors.totalCost && <p className="mt-1 text-xs font-bold text-red-500">{errors.totalCost.message}</p>}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-slate-900 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-slate-900/20 transition-all transform hover:-translate-y-0.5 disabled:opacity-70 mt-6"
              >
                {isSubmitting ? "Authorizing..." : "Log Transaction"}
              </button>

              {serverMessage.text && (
                <div className={`mt-4 p-3 rounded-xl text-sm font-bold text-center ${
                  serverMessage.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                }`}>
                  {serverMessage.text}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* --- RIGHT: RECENT TRANSACTIONS TABLE --- */}
        <div className="xl:col-span-2">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-full">
            <h3 className="text-xl font-bold text-slate-800 mb-6">Recent Pump Activity</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 pr-4">ID / Time</th>
                    <th className="pb-3 pr-4">Fuel & Pump</th>
                    <th className="pb-3 pr-4 text-right">Liters</th>
                    <th className="pb-3 pr-4 text-right">Revenue</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-slate-700">
                  {sales.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-500 font-medium">
                        <div className="text-4xl mb-4">⛽</div>
                        <p className="text-slate-500 font-medium">No sales recorded yet.</p>
                      </td>
                    </tr>
                  ) : (
                    sales.map((s) => (
                      <tr key={s.saleId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 pr-4">
                          <p className="text-slate-900 font-bold font-mono">TXN-{s.saleId.toString().padStart(5, '0')}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {s.saleDate ? new Date(s.saleDate).toLocaleString() : 'N/A'}
                          </p>
                        </td>
                        <td className="py-4 pr-4">
                          <p className="font-bold text-slate-800">Pump {s.pumpNumber}</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase bg-slate-100 text-slate-600 mt-1">
                            {s.fuelType}
                          </span>
                        </td>
                        <td className="py-4 pr-4 text-right font-medium">
                          {s.litersPumped.toFixed(2)} L
                        </td>
                        <td className="py-4 pr-4 text-right font-black text-green-700">
                          Rs. {s.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-4 text-right">
                          {/* FIXED: Removed opacity fade so button is always visible */}
                          <button
                            onClick={() => openDeleteModal(s.saleId)}
                            className="text-[10px] font-black tracking-wider uppercase text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md transition-colors"
                          >
                            Void
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {/* --- CUSTOM DELETE CONFIRMATION MODAL --- */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-sm w-full border border-slate-200 transform transition-all">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4 mx-auto">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-center text-slate-900 mb-2">Void Transaction?</h3>
            <p className="text-slate-500 text-sm text-center mb-8 font-medium">
              Are you sure you want to void this sale? The fuel will be immediately returned to the master inventory.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal({ isOpen: false, saleId: null })}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/20 transition-all active:scale-95"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}