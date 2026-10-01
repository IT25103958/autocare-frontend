"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../context/AuthContext";
import api from "../../utils/axiosInstance";
import { getErrorMessage } from "../../utils/apiError";
import { downloadFile } from "../billing/_components/billing";

// Pump number is optional here: an attendant's pump comes from their open
// shift on the server; only a supervisor covering a pump picks one.
const fuelSaleSchema = z.object({
  fuelType: z.string().min(1, "Select a fuel type."),
  pumpNumber: z.string().optional(),
  litersPumped: z.coerce.number().gt(0, "Liters must be greater than 0.").max(1000, "A single sale can't exceed 1000 L."),
  paymentMethod: z.enum(["CASH", "CARD", "QR"]),
  // Optional: links the sale to a registered customer so they get the receipt in their portal.
  vehicleRegNo: z.string().trim().regex(/^[A-Za-z0-9 -]{3,15}$/, "Use letters, digits and dashes, e.g. CAB-4521.").or(z.literal("")).optional(),
});

// z.coerce makes the raw input type differ from the parsed output type.
type FuelSaleFormInputs = z.input<typeof fuelSaleSchema>;
type FuelSaleFormValues = z.output<typeof fuelSaleSchema>;

interface FuelSale {
  saleId: number;
  fuelType: string;
  pumpNumber: number;
  litersPumped: number;
  totalCost: number;
  saleDate: string;
  attendantName?: string;
  recordedBy?: string;
  status?: string | null;
  voidReason?: string;
  voidedBy?: string;
  unitPrice?: number | null;
  paymentMethod?: string | null;
  vehicleRegNo?: string | null;
}

interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

const PAGE_SIZE = 25;
const PAYMENT_LABELS: Record<string, string> = { CASH: "Cash", CARD: "Card", QR: "QR" };

interface FuelTank {
  tankId: number;
  fuelType: string;
  pricePerLiter: number;
}

interface PumpAssignment {
  id: number;
  pumpNumber: number;
  attendantUsername: string;
  shiftStartedAt: string;
}

export default function FuelPosPage() {
  const { user } = useAuth();

  const role = user?.role;
  const isAttendant = role === "FUEL_ATTENDANT";
  // Only these roles can void, and they match the backend's @PreAuthorize.
  const isSupervisor = role === "FUEL_STATION_SUPERVISOR" || role === "SUPER_ADMIN";
  // Owners and Finance may read the ledger but can't ring up or void sales.
  const canSell = isAttendant || isSupervisor;

  const [sales, setSales] = useState<FuelSale[]>([]);
  // Sales are paged on the server; the list no longer downloads every sale.
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSales, setTotalSales] = useState(0);
  const [tanks, setTanks] = useState<FuelTank[]>([]);
  const [activeShifts, setActiveShifts] = useState<PumpAssignment[]>([]);
  const [loadError, setLoadError] = useState("");
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });
  const [isMounted, setIsMounted] = useState(false);

  const [voidModal, setVoidModal] = useState<{ isOpen: boolean; saleId: number | null; reason: string; isSubmitting: boolean }>({
    isOpen: false, saleId: null, reason: "", isSubmitting: false,
  });

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FuelSaleFormInputs, unknown, FuelSaleFormValues>({
    resolver: zodResolver(fuelSaleSchema),
    defaultValues: { fuelType: "", pumpNumber: "", paymentMethod: "CASH", vehicleRegNo: "" },
  });

  const selectedFuel = watch("fuelType");
  const pumpedVolume = parseFloat(String(watch("litersPumped") ?? "")) || 0;

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      // Sales are already filtered and sorted server-side (attendants only
      // receive their own).
      const salesRes = await api.get<PageResponse<FuelSale>>("/fuel", { params: { page, size: PAGE_SIZE } });
      setSales(salesRes.data.content);
      setTotalPages(Math.max(1, salesRes.data.totalPages));
      setTotalSales(salesRes.data.totalElements);
      if (canSell) {
        const [tanksRes, shiftsRes] = await Promise.all([
          api.get<FuelTank[]>("/tanks"),
          api.get<PumpAssignment[]>("/pumps/active"),
        ]);
        setTanks(tanksRes.data);
        setActiveShifts(shiftsRes.data);
      }
      setLoadError("");
    } catch (err) {
      setLoadError(getErrorMessage(err, "Couldn't load pump data. Check that the server is running."));
    }
  }, [user, canSell, page]);

  useEffect(() => {
    setIsMounted(true);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const myShift = activeShifts.find((a) => a.attendantUsername === user?.username);
  const sellableTanks = tanks.filter((t) => t.pricePerLiter > 0);
  const salesLocked = isAttendant ? !myShift : activeShifts.length === 0;

  const flash = (type: "success" | "error", text: string) => {
    setServerMessage({ type, text });
    if (type === "success") setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
  };

  const onSubmit = async (data: FuelSaleFormValues) => {
    setServerMessage({ type: "", text: "" });
    if (isSupervisor && !data.pumpNumber) {
      flash("error", "Select the pump this sale was made on.");
      return;
    }
    try {
      const response = await api.post<FuelSale>("/fuel/sell", {
        fuelType: data.fuelType,
        litersPumped: data.litersPumped,
        pumpNumber: isSupervisor ? Number(data.pumpNumber) : undefined,
        paymentMethod: data.paymentMethod,
        vehicleRegNo: data.vehicleRegNo || undefined,
      });
      flash("success", `Transaction #${response.data.saleId} recorded — Rs. ${response.data.totalCost.toFixed(2)}. Use "Receipt" in the list to print it.`);
      // Keep pump and fuel selected for the next customer; clear the liters.
      reset({ fuelType: data.fuelType, pumpNumber: data.pumpNumber, litersPumped: "", paymentMethod: "CASH", vehicleRegNo: "" });
      // Show the new sale at the top.
      setPage(0);
      fetchData();
    } catch (err) {
      flash("error", getErrorMessage(err, "Transaction failed."));
    }
  };

  const printReceipt = async (saleId: number) => {
    try {
      await downloadFile(`/fuel/${saleId}/receipt`, `fuel-receipt-${saleId}.pdf`);
    } catch (err) {
      flash("error", getErrorMessage(err, "Couldn't download the receipt."));
    }
  };

  const executeVoid = async () => {
    if (!voidModal.saleId || voidModal.reason.trim().length < 5) return;
    setVoidModal((m) => ({ ...m, isSubmitting: true }));
    try {
      await api.post(`/fuel/${voidModal.saleId}/void`, { reason: voidModal.reason.trim() });
      flash("success", "Transaction voided and logged to the audit trail.");
      fetchData();
    } catch (err) {
      flash("error", getErrorMessage(err, "Failed to void transaction."));
    } finally {
      setVoidModal({ isOpen: false, saleId: null, reason: "", isSubmitting: false });
    }
  };

  const activeTank = tanks.find((t) => t.fuelType === selectedFuel);
  const livePricePerLiter = activeTank ? activeTank.pricePerLiter : 0;
  const estimatedTotal = pumpedVolume * livePricePerLiter;

  if (!isMounted) return null;

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] relative animate-fade-in-up">

      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Fuel Station POS</h1>
          <p className="text-slate-500 font-medium mt-1">
            {canSell ? "Process live pump sales and maintain ledger." : "Read-only view of the pump sales ledger."}
          </p>
        </div>
        <div className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border ${isSupervisor ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-200 text-slate-600 border-slate-300'}`}>
          {isSupervisor ? 'Manager Mode Active' : isAttendant ? 'Attendant POS Mode' : 'Ledger View'}
        </div>
      </div>

      {loadError && (
        <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-sm font-bold text-red-700 flex justify-between items-center gap-4">
          <span>{loadError}</span>
          <button onClick={fetchData} className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-black uppercase tracking-widest">Retry</button>
        </div>
      )}

      <div className={`grid grid-cols-1 ${canSell ? 'xl:grid-cols-3' : ''} gap-8`}>
        {/* --- LEFT: LOG SALE FORM --- */}
        {canSell && (
        <div className="xl:col-span-1">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 sticky top-6">
            <h2 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Record Sale</h2>

            {salesLocked ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm font-bold text-amber-800">
                {isAttendant
                  ? "You don't have an open shift. Ask your supervisor to assign you to a pump before recording sales."
                  : "No pump has an open shift. Assign an attendant from the dashboard first."}
              </div>
            ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Pump</label>
                  {isAttendant ? (
                    // Locked to the attendant's shift; the server enforces this too.
                    <div className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 font-black text-slate-700">
                      Pump {myShift?.pumpNumber}
                    </div>
                  ) : (
                    <select
                      {...register("pumpNumber")}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none"
                    >
                      <option value="">-- Pump --</option>
                      {activeShifts
                        .slice()
                        .sort((a, b) => a.pumpNumber - b.pumpNumber)
                        .map((s) => (
                          <option key={s.id} value={s.pumpNumber}>Pump {s.pumpNumber} ({s.attendantUsername})</option>
                        ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Fuel Type</label>
                  <select
                    {...register("fuelType")}
                    className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${errors.fuelType ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"}`}
                  >
                    <option value="">-- Fuel --</option>
                    {/* Built from the real tanks; unpriced tanks can't be sold. */}
                    {sellableTanks.map((t) => (
                      <option key={t.tankId} value={t.fuelType}>{t.fuelType}</option>
                    ))}
                  </select>
                </div>
              </div>
              {errors.fuelType && <p className="mt-1 text-xs font-bold text-red-500">{errors.fuelType.message}</p>}
              {tanks.length > 0 && sellableTanks.length === 0 && (
                <p className="text-xs font-bold text-amber-600">No tank has a pump price set yet — a supervisor must set one first.</p>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Payment</label>
                {/* Only cash counts toward the drawer at shift close. */}
                <div className="grid grid-cols-3 gap-2">
                  {(["CASH", "CARD", "QR"] as const).map((m) => (
                    <label key={m} className="cursor-pointer">
                      <input type="radio" value={m} {...register("paymentMethod")} className="peer sr-only" />
                      <span className="block text-center px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-black uppercase tracking-widest text-slate-600 peer-checked:bg-slate-900 peer-checked:text-white peer-checked:border-slate-900">
                        {PAYMENT_LABELS[m]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Liters Pumped</label>
                <input
                  {...register("litersPumped")}
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1000"
                  placeholder="e.g., 20.5"
                  className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all font-black text-blue-700 ${errors.litersPumped ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"}`}
                />
                {errors.litersPumped && <p className="mt-1 text-xs font-bold text-red-500">{errors.litersPumped.message}</p>}
              </div>

              <div>
                <label htmlFor="vehicleRegNo" className="block text-sm font-bold text-slate-700 mb-1">Vehicle number <span className="font-medium text-slate-400">(optional)</span></label>
                <input
                  id="vehicleRegNo"
                  {...register("vehicleRegNo")}
                  placeholder="e.g., CAB-4521"
                  maxLength={15}
                  className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white outline-none uppercase font-mono font-bold text-slate-800 ${errors.vehicleRegNo ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`}
                />
                <p className="mt-1 text-[11px] text-slate-400 font-medium">Registered customers see this purchase and its receipt in their portal.</p>
                {errors.vehicleRegNo && <p className="mt-1 text-xs font-bold text-red-500">{errors.vehicleRegNo.message}</p>}
              </div>

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
            </form>
            )}

            {serverMessage.text && (
              <div className={`mt-4 p-3 rounded-xl text-sm font-bold text-center ${serverMessage.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {serverMessage.text}
              </div>
            )}
          </div>
        </div>
        )}

        {/* --- RIGHT: RECENT TRANSACTIONS TABLE --- */}
        <div className={canSell ? "xl:col-span-2" : ""}>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-full">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-xl font-bold text-slate-800">{isAttendant ? "My Pump Activity" : "Recent Pump Activity"}</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="pb-4 pr-4">ID / Date & Time</th>
                    <th className="pb-4 pr-4">Fuel & Pump</th>
                    <th className="pb-4 pr-4">Attendant</th>
                    <th className="pb-4 pr-4 text-right">Liters</th>
                    <th className="pb-4 pr-4 text-right">Revenue</th>
                    <th className="pb-4 pr-4 text-right">Receipt</th>
                    {isSupervisor && <th className="pb-4 text-right">Manager Actions</th>}
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-slate-700">
                  {sales.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-500 font-medium">
                        <div className="text-4xl mb-4">⛽</div>
                        <p className="text-slate-500 font-medium">No sales recorded yet.</p>
                      </td>
                    </tr>
                  ) : (
                    sales.map((s) => {
                      const voided = s.status === "VOIDED";
                      return (
                      <tr key={s.saleId} className={`border-b border-slate-50 transition-colors ${voided ? "bg-slate-50/70 text-slate-400" : "hover:bg-slate-50/50"}`}>
                        <td className="py-4 pr-4">
                          <p className={`font-bold font-mono ${voided ? "line-through" : "text-slate-900"}`}>TXN-{s.saleId.toString().padStart(5, '0')}</p>
                          <p className="text-[10px] font-black text-slate-400 mt-0.5 tracking-wider uppercase">
                            {s.saleDate ? new Date(s.saleDate).toLocaleString() : 'N/A'}
                          </p>
                        </td>
                        <td className="py-4 pr-4">
                          <p className={`font-bold ${voided ? "" : "text-slate-800"}`}>Pump {s.pumpNumber}</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase bg-slate-100 text-slate-500 mt-1">
                            {s.fuelType}
                          </span>
                        </td>
                        <td className="py-4 pr-4">
                           <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                             {s.attendantName || 'System'}
                           </span>
                           {s.recordedBy && s.recordedBy !== s.attendantName && (
                             <p className="text-[10px] font-bold text-slate-400 mt-1">keyed by {s.recordedBy}</p>
                           )}
                        </td>
                        <td className={`py-4 pr-4 text-right font-medium ${voided ? "line-through" : ""}`}>
                          {s.litersPumped.toFixed(2)} L
                        </td>
                        <td className={`py-4 pr-4 text-right font-black ${voided ? "line-through" : "text-emerald-600"}`}>
                          Rs. {s.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                            {PAYMENT_LABELS[s.paymentMethod ?? "CASH"] ?? s.paymentMethod}
                            {s.unitPrice != null && ` · @ Rs. ${s.unitPrice.toFixed(2)}/L`}
                          </p>
                          {s.vehicleRegNo && <p className="text-[10px] font-bold font-mono text-slate-400 mt-0.5">{s.vehicleRegNo}</p>}
                        </td>
                        <td className="py-4 pr-4 text-right">
                          <button onClick={() => printReceipt(s.saleId)}
                            className="text-[9px] font-black tracking-widest uppercase text-blue-700 hover:text-white bg-blue-50 hover:bg-blue-600 border border-blue-100 px-3 py-1.5 rounded-md transition-colors">
                            Receipt
                          </button>
                        </td>

                        {isSupervisor && (
                          <td className="py-4 text-right">
                            {voided ? (
                              <span title={`${s.voidReason ?? ""}${s.voidedBy ? ` — ${s.voidedBy}` : ""}`} className="text-[9px] font-black tracking-widest uppercase text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-md">
                                Voided
                              </span>
                            ) : (
                              <button
                                onClick={() => setVoidModal({ isOpen: true, saleId: s.saleId, reason: "", isSubmitting: false })}
                                className="text-[9px] font-black tracking-widest uppercase text-red-500 hover:text-white bg-red-50 hover:bg-red-500 border border-red-100 px-3 py-1.5 rounded-md transition-colors"
                              >
                                Void
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-100 text-xs font-bold text-slate-500">
                <span>Page {page + 1} of {totalPages} · {totalSales.toLocaleString()} sales</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Newer</button>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Older</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- SECURE VOID MODAL --- */}
      {voidModal.isOpen && isSupervisor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4 mx-auto">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-center text-slate-900 mb-2 tracking-tight">Void Transaction</h3>
            <p className="text-slate-500 text-xs text-center mb-6 font-medium">
              The sale stays on record marked as voided, and its fuel is returned to the tank. Only sales from a shift that is still open can be voided.
            </p>

            <div className="mb-6">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Reason for Void</label>
              <input
                type="text"
                placeholder="e.g., Pump malfunction, Typo by attendant"
                value={voidModal.reason}
                onChange={(e) => setVoidModal({ ...voidModal, reason: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-red-500 font-medium text-sm"
              />
              <p className="text-[10px] font-bold text-slate-400 mt-1">At least 5 characters.</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setVoidModal({ isOpen: false, saleId: null, reason: "", isSubmitting: false })} className="flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={executeVoid}
                disabled={voidModal.reason.trim().length < 5 || voidModal.isSubmitting}
                className="flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 shadow-md shadow-red-600/20 transition-all active:scale-95"
              >
                {voidModal.isSubmitting ? "Voiding..." : "Confirm Void"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
