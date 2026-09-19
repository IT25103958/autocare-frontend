"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// --- STRICT ENTERPRISE VALIDATION ---
const deliverySchema = z.object({
  tankId: z.coerce.number().int("Tank ID must be a whole number.").min(1, "Please select a valid storage tank."),
  deliveryAmount: z.coerce.number().min(10, "Minimum delivery requirement is 10 Liters."),
  supplierInvoice: z.string().min(3, "Authorized supplier invoice reference is required."),
});

type DeliveryFormInputs = z.infer<typeof deliverySchema>;

interface FuelTank {
  tankId: number;
  fuelType: string;
  capacity: number;
  currentStock: number;
  status: string;
}

export default function FuelTankDashboard() {
  const [tanks, setTanks] = useState<FuelTank[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isMounted, setIsMounted] = useState(false);

  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" }>({
    isOpen: false, title: "", message: "", type: "success"
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<DeliveryFormInputs>({
    resolver: zodResolver(deliverySchema),
    mode: "onChange"
  });

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  const fetchTanks = async () => {
    try {
      const response = await axios.get("http://localhost:8080/api/tanks", getAuthHeader());
      setTanks(response.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch fuel tanks", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchTanks();

    // Live Polling every 10 seconds for real-time dashboard updates
    const intervalId = setInterval(() => { fetchTanks(); }, 10000);
    return () => clearInterval(intervalId);
  }, []);

  const onSubmit = async (data: DeliveryFormInputs) => {
    try {
      await axios.post("http://localhost:8080/api/tanks/refill", data, getAuthHeader());
      setModal({ isOpen: true, type: "success", title: "Delivery Registered", message: "Fuel volume successfully logged into the telemetry system." });
      reset();
      fetchTanks();
    } catch (err: any) {
      let errorMsg = "Failed to communicate with the server. Ensure the backend endpoint is running.";

      if (err.response?.data) {
        if (typeof err.response.data === 'string') {
          errorMsg = err.response.data;
        } else if (err.response.data.message) {
          errorMsg = err.response.data.message;
        } else if (err.response.data.error) {
          errorMsg = `Server Error: ${err.response.data.error} (Status ${err.response.status})`;
        }
      }

      setModal({ isOpen: true, type: "error", title: "Action Failed", message: errorMsg });
    }
  };

  if (!isMounted) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12 relative">
      <div className="max-w-7xl mx-auto">

        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in-up">
          <div>
            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Master Fuel Inventory</h1>
            <p className="text-slate-500 font-medium mt-2">Live monitoring of underground storage tanks and delivery logging.</p>
          </div>

          <div className="flex items-center gap-2 bg-white px-5 py-2.5 rounded-full shadow-sm border border-slate-200">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="text-xs font-bold text-slate-600">
              Live Sync • Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* LEFT: FORM */}
          <div className="lg:col-span-1 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                 <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">⛽</div>
                 <h2 className="text-xl font-bold text-slate-800">Log Fuel Delivery</h2>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Select Storage Tank</label>
                  <select {...register("tankId")} className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white outline-none transition-all cursor-pointer ${errors.tankId ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`}>
                    <option value="">-- Choose Assigned Tank --</option>
                    {tanks.map(tank => (
                      <option key={tank.tankId} value={tank.tankId}>
                        Tank {tank.tankId} ({tank.fuelType})
                      </option>
                    ))}
                  </select>
                  {errors.tankId && <p className="mt-1.5 text-[11px] font-bold text-red-500">{errors.tankId.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Received Volume (Liters)</label>
                  <input {...register("deliveryAmount")} type="number" step="0.1" placeholder="e.g., 5000" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white outline-none transition-all ${errors.deliveryAmount ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                  {errors.deliveryAmount && <p className="mt-1.5 text-[11px] font-bold text-red-500">{errors.deliveryAmount.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Supplier Invoice Ref</label>
                  <input {...register("supplierInvoice")} type="text" placeholder="e.g., INV-9982" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white outline-none transition-all font-mono uppercase ${errors.supplierInvoice ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                  {errors.supplierInvoice && <p className="mt-1.5 text-[11px] font-bold text-red-500">{errors.supplierInvoice.message}</p>}
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full bg-slate-900 hover:bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 mt-2">
                  {isSubmitting ? "Transmitting..." : "Update Live Tank Stock"}
                </button>
              </form>
            </div>
          </div>

          {/* RIGHT: LIVE TELEMETRY DASHBOARD */}
          <div className="lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {tanks.length === 0 ? (
                <div className="col-span-2 text-center py-16 bg-white rounded-3xl shadow-sm border border-slate-200">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900 mx-auto mb-4"></div>
                  <p className="text-slate-500 font-bold">Synchronizing telemetry data...</p>
                </div>
              ) : (
                tanks.map((tank) => {
                  const safeCurrentStock = tank.currentStock || 0;
                  const safeMaxCapacity = tank.capacity || 1;

                  const fillPercentage = Math.min(100, Math.max(0, (safeCurrentStock / safeMaxCapacity) * 100));

                  return (
                    <div key={tank.tankId} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-blue-200 transition-colors">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h3 className="text-xl font-black text-slate-800">Tank {tank.tankId}</h3>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest uppercase bg-slate-100 text-slate-600 mt-1">
                            {tank.fuelType}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-black text-slate-900">{safeCurrentStock.toLocaleString()}<span className="text-sm text-slate-500 font-bold ml-1">L</span></p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">of {safeMaxCapacity.toLocaleString()} L</p>
                        </div>
                      </div>

                      {/* TAILWIND FIX: Color classes dynamically evaluated but explicitly written in the JSX string */}
                      <div className="h-6 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <div
                          className={`h-full transition-all duration-1000 ease-in-out relative ${fillPercentage > 50 ? 'bg-green-500' : fillPercentage > 20 ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`}
                          style={{ width: `${fillPercentage}%` }}
                        >
                          <div className="absolute inset-0 bg-white/20 w-full h-full transform -skew-x-12 translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>
                        </div>
                      </div>

                      <div className="mt-4 flex justify-between items-center">
                        <span className={`text-xs font-black uppercase tracking-wider ${fillPercentage <= 20 ? 'text-red-500' : 'text-slate-400'}`}>
                          {fillPercentage <= 20 ? 'CRITICAL LEVEL' : 'OPTIMAL'}
                        </span>
                        <span className={`text-sm font-black ${fillPercentage <= 20 ? 'text-red-500' : 'text-slate-900'}`}>
                          {fillPercentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- ENTERPRISE MODAL --- */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-200 text-center">
            <div className={`flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto ${modal.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={modal.type === 'success' ? "M5 13l4 4L19 7" : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"} />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">{modal.title}</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">{modal.message}</p>
            <button onClick={() => setModal({ ...modal, isOpen: false })} className={`w-full px-4 py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md transition-all active:scale-95`}>Acknowledge</button>
          </div>
        </div>
      )}
    </div>
  );
}