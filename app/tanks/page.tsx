"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import api from "../../utils/axiosInstance";
import { getErrorMessage } from "../../utils/apiError";

interface FuelTank {
  tankId: number;
  fuelType: string;
  capacity: number;
  currentStock: number;
  pricePerLiter: number;
  reorderLevel?: number | null;
}

interface TankDipReading {
  id: number;
  tankId: number;
  fuelType: string;
  measuredStock: number;
  bookStock: number;
  variance: number;
  salesSinceLastDip: number;
  tolerance: number;
  withinTolerance: boolean;
  adjusted: boolean;
  note?: string | null;
  recordedBy: string;
  recordedAt: string;
}

interface FuelPriceHistory {
  id: number;
  fuelType: string;
  oldPrice?: number | null;
  newPrice: number;
  source: string;
  reference?: string | null;
  changedBy: string;
  changedAt: string;
}

type DipForm = { tankId: string; measuredStock: string; adjustBookStock: boolean; note: string };
const EMPTY_DIP_FORM: DipForm = { tankId: "", measuredStock: "", adjustBookStock: false, note: "" };

const fmtL = (n: number, digits = 0) => `${n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })} L`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)} L`;

// Tanks without a configured reorder level warn at 20% of capacity.
const effectiveReorderLevel = (t: FuelTank) => t.reorderLevel ?? t.capacity * 0.2;

export default function WetStockPage() {
  const { user } = useAuth();
  const canOperate = user?.role === "FUEL_STATION_SUPERVISOR" || user?.role === "SUPER_ADMIN";

  const [tanks, setTanks] = useState<FuelTank[]>([]);
  const [dips, setDips] = useState<TankDipReading[]>([]);
  const [priceHistory, setPriceHistory] = useState<FuelPriceHistory[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState("");

  const [dipForm, setDipForm] = useState<DipForm>(EMPTY_DIP_FORM);
  const [dipError, setDipError] = useState("");
  const [isSavingDip, setIsSavingDip] = useState(false);
  const [dipResult, setDipResult] = useState<TankDipReading | null>(null);

  const [reorderInput, setReorderInput] = useState<{ [tankId: number]: string }>({});
  const [savingReorderFor, setSavingReorderFor] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [tanksRes, dipsRes, pricesRes] = await Promise.all([
        api.get<FuelTank[]>("/tanks"),
        api.get<TankDipReading[]>("/tanks/dips"),
        api.get<FuelPriceHistory[]>("/tanks/price-history"),
      ]);
      setTanks(tanksRes.data);
      setDips(dipsRes.data);
      setPriceHistory(pricesRes.data);
      setLastUpdated(new Date());
      setLoadError("");
    } catch (err) {
      setLoadError(getErrorMessage(err, "Couldn't load tank data. Check that the server is running."));
    }
  }, [user]);

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 15000);
    return () => clearInterval(intervalId);
  }, [fetchData]);

  const latestDipFor = (tankId: number) => dips.find((d) => d.tankId === tankId);
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

  const selectedTank = tanks.find((t) => String(t.tankId) === dipForm.tankId);
  const previewVariance = selectedTank && dipForm.measuredStock !== "" && !isNaN(parseFloat(dipForm.measuredStock))
    ? parseFloat(dipForm.measuredStock) - selectedTank.currentStock
    : null;

  const submitDip = async () => {
    const measured = parseFloat(dipForm.measuredStock);
    if (!dipForm.tankId) { setDipError("Select the tank you dipped."); return; }
    if (dipForm.measuredStock === "" || isNaN(measured) || measured < 0) { setDipError("Enter the measured stock in liters."); return; }
    if (dipForm.adjustBookStock && dipForm.note.trim().length < 5) {
      setDipError("Adjusting book stock writes off the difference — give a reason (at least 5 characters).");
      return;
    }
    setIsSavingDip(true);
    setDipError("");
    try {
      const res = await api.post<TankDipReading>(`/tanks/${dipForm.tankId}/dips`, {
        measuredStock: measured,
        adjustBookStock: dipForm.adjustBookStock,
        note: dipForm.note.trim() || null,
      });
      setDipResult(res.data);
      setDipForm(EMPTY_DIP_FORM);
      fetchData();
    } catch (err) {
      setDipError(getErrorMessage(err, "Failed to record the dip."));
    } finally {
      setIsSavingDip(false);
    }
  };

  const saveReorderLevel = async (tank: FuelTank) => {
    const level = parseFloat(reorderInput[tank.tankId]);
    if (isNaN(level) || level < 0 || level >= tank.capacity) {
      setNotice(`Reorder level for ${tank.fuelType} must be between 0 and ${fmtL(tank.capacity)}.`);
      return;
    }
    setSavingReorderFor(tank.tankId);
    try {
      await api.put(`/tanks/${tank.tankId}/reorder-level`, { reorderLevel: level });
      setReorderInput({ ...reorderInput, [tank.tankId]: "" });
      setNotice("");
      fetchData();
    } catch (err) {
      setNotice(getErrorMessage(err, "Failed to save the reorder level."));
    } finally {
      setSavingReorderFor(null);
    }
  };

  const lowTanks = tanks.filter((t) => t.currentStock <= effectiveReorderLevel(t));
  const undippedToday = tanks.filter((t) => { const d = latestDipFor(t.tankId); return !d || !isToday(d.recordedAt); });

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12 relative">
      <div className="max-w-7xl mx-auto space-y-8">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in-up">
          <div>
            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Wet Stock Control</h1>
            <p className="text-slate-500 font-medium mt-2">Tank levels, reorder alerts, and daily dip reconciliation against book stock.</p>
          </div>
          <div className="flex items-center gap-2 bg-white px-5 py-2.5 rounded-full shadow-sm border border-slate-200">
            <span className={`relative inline-flex rounded-full h-3 w-3 ${loadError ? "bg-red-500" : "bg-green-500"}`}></span>
            <span className="text-xs font-bold text-slate-600">
              {loadError ? "Sync failed" : `Live Sync • ${lastUpdated ? lastUpdated.toLocaleTimeString() : "loading..."}`}
            </span>
          </div>
        </div>

        {loadError && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm font-bold text-red-700 flex justify-between items-center gap-4">
            <span>{loadError}</span>
            <button onClick={fetchData} className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-black uppercase tracking-widest">Retry</button>
          </div>
        )}

        {/* ALERTS */}
        {(lowTanks.length > 0 || (canOperate && undippedToday.length > 0)) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lowTanks.length > 0 && (
              <div className="p-5 rounded-2xl bg-red-50 border border-red-200">
                <p className="text-xs font-black uppercase tracking-widest text-red-700 mb-1">Reorder needed</p>
                <p className="text-sm font-bold text-red-800">{lowTanks.map((t) => t.fuelType).join(", ")} at or below reorder level.</p>
                {canOperate && (
                  <Link href="/fuel-deliveries" className="inline-block mt-3 text-xs font-black uppercase tracking-widest text-red-700 underline">Order fuel →</Link>
                )}
              </div>
            )}
            {canOperate && undippedToday.length > 0 && (
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200">
                <p className="text-xs font-black uppercase tracking-widest text-amber-700 mb-1">Daily dip outstanding</p>
                <p className="text-sm font-bold text-amber-800">Not dipped today: {undippedToday.map((t) => t.fuelType).join(", ")}.</p>
              </div>
            )}
          </div>
        )}

        <div className={`grid grid-cols-1 ${canOperate ? "lg:grid-cols-3" : ""} gap-8`}>

          {/* LEFT: RECORD DIP */}
          {canOperate && (
            <div className="lg:col-span-1">
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 sticky top-6">
                <h2 className="text-xl font-bold text-slate-800 mb-1">Record Tank Dip</h2>
                <p className="text-xs font-medium text-slate-500 mb-6 border-b border-slate-100 pb-4">
                  Dip each tank daily, ideally with the pumps idle. The reading is compared with book stock (opening + deliveries − sales).
                </p>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Tank</label>
                    <select
                      value={dipForm.tankId}
                      onChange={(e) => { setDipForm({ ...dipForm, tankId: e.target.value }); setDipError(""); }}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none cursor-pointer"
                    >
                      <option value="">-- Choose Tank --</option>
                      {tanks.map((t) => (
                        <option key={t.tankId} value={t.tankId}>Tank {t.tankId} ({t.fuelType})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Measured Stock (Liters)</label>
                    <input
                      type="number" step="0.01" min="0" placeholder="From dip chart / gauge"
                      value={dipForm.measuredStock}
                      onChange={(e) => { setDipForm({ ...dipForm, measuredStock: e.target.value }); setDipError(""); }}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-bold"
                    />
                    {selectedTank && (
                      <p className="mt-1.5 text-[11px] font-bold text-slate-500">
                        Book stock: {fmtL(selectedTank.currentStock, 2)}
                        {previewVariance != null && (
                          <span className={previewVariance < 0 ? "text-red-600" : previewVariance > 0 ? "text-blue-600" : "text-emerald-600"}>
                            {" "}· difference {signed(previewVariance)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox" className="mt-0.5"
                      checked={dipForm.adjustBookStock}
                      onChange={(e) => setDipForm({ ...dipForm, adjustBookStock: e.target.checked })}
                    />
                    <span className="text-xs font-bold text-slate-700">
                      Adjust book stock to this reading
                      <span className="block font-medium text-slate-500 mt-0.5">Writes off the difference as a loss/gain. Only do this once the variance is explained.</span>
                    </span>
                  </label>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">
                      Note {dipForm.adjustBookStock ? "(required)" : "(optional)"}
                    </label>
                    <textarea
                      rows={2}
                      value={dipForm.note}
                      onChange={(e) => setDipForm({ ...dipForm, note: e.target.value })}
                      placeholder="e.g., Morning dip, pumps idle"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none text-sm"
                    />
                  </div>

                  {dipError && <p className="text-xs font-bold text-red-600">{dipError}</p>}

                  <button
                    onClick={submitDip}
                    disabled={isSavingDip}
                    className="w-full bg-slate-900 hover:bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg transition-all disabled:opacity-70"
                  >
                    {isSavingDip ? "Recording..." : "Record Dip"}
                  </button>

                  <p className="text-[11px] font-medium text-slate-400">
                    Fuel is added to tanks only by receiving a delivery on the{" "}
                    <Link href="/fuel-deliveries" className="font-bold text-blue-600 underline">Fuel Deliveries</Link> page, which also bills the supplier.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* RIGHT: TANK CARDS */}
          <div className={canOperate ? "lg:col-span-2" : ""}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {tanks.length === 0 ? (
                <div className="col-span-2 text-center py-16 bg-white rounded-3xl shadow-sm border border-slate-200">
                  <p className="text-slate-500 font-bold">
                    {!lastUpdated && !loadError ? "Loading tanks..." : loadError ? "Tank data unavailable." : "No tanks set up yet — add one from the dashboard."}
                  </p>
                </div>
              ) : (
                tanks.map((tank) => {
                  const capacity = tank.capacity || 1;
                  const fillPercentage = Math.min(100, Math.max(0, (tank.currentStock / capacity) * 100));
                  const reorderAt = effectiveReorderLevel(tank);
                  const isLow = tank.currentStock <= reorderAt;
                  const ullage = Math.max(0, tank.capacity - tank.currentStock);
                  const lastDip = latestDipFor(tank.tankId);

                  return (
                    <div key={tank.tankId} className={`bg-white p-7 rounded-3xl shadow-sm border ${isLow ? "border-red-200" : "border-slate-200"}`}>
                      <div className="flex justify-between items-start mb-5">
                        <div>
                          <h3 className="text-xl font-black text-slate-800">Tank {tank.tankId}</h3>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest uppercase bg-slate-100 text-slate-600 mt-1">
                            {tank.fuelType}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-black text-slate-900">{tank.currentStock.toLocaleString(undefined, { maximumFractionDigits: 0 })}<span className="text-sm text-slate-500 font-bold ml-1">L</span></p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">book stock of {fmtL(tank.capacity)}</p>
                        </div>
                      </div>

                      <div className="relative h-5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-700 ${isLow ? "bg-red-500" : fillPercentage > 50 ? "bg-green-500" : "bg-yellow-500"}`}
                          style={{ width: `${fillPercentage}%` }}
                        />
                        {/* Reorder marker */}
                        <div className="absolute top-0 h-full w-0.5 bg-slate-900/60" style={{ left: `${Math.min(100, (reorderAt / capacity) * 100)}%` }} title="Reorder level" />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Free space</p>
                          <p className="font-black text-slate-800">{fmtL(ullage)}</p>
                        </div>
                        <div>
                          <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Reorder at</p>
                          <p className={`font-black ${isLow ? "text-red-600" : "text-slate-800"}`}>
                            {fmtL(reorderAt)}{tank.reorderLevel == null && <span className="text-slate-400 font-bold"> (default 20%)</span>}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Last dip</p>
                          {lastDip ? (
                            <p className="font-bold text-slate-700">
                              {new Date(lastDip.recordedAt).toLocaleString()} ·{" "}
                              <span className={lastDip.withinTolerance ? "text-emerald-600" : "text-red-600"}>
                                {signed(lastDip.variance)} {lastDip.withinTolerance ? "(within tolerance)" : `(outside ±${lastDip.tolerance.toFixed(0)} L)`}
                              </span>
                            </p>
                          ) : (
                            <p className="font-bold text-amber-600">Never dipped</p>
                          )}
                        </div>
                      </div>

                      {canOperate && (
                        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2">
                          <input
                            type="number" min="0" step="1"
                            placeholder="Set reorder level (L)"
                            value={reorderInput[tank.tankId] || ""}
                            onChange={(e) => setReorderInput({ ...reorderInput, [tank.tankId]: e.target.value })}
                            className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                          />
                          <button
                            onClick={() => saveReorderLevel(tank)}
                            disabled={!reorderInput[tank.tankId] || savingReorderFor === tank.tankId}
                            className="px-3 py-2 bg-slate-900 hover:bg-blue-600 disabled:opacity-40 text-white text-[10px] font-black uppercase tracking-wider rounded-lg"
                          >
                            {savingReorderFor === tank.tankId ? "..." : "Save"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {notice && <p className="mt-4 text-xs font-bold text-red-600">{notice}</p>}
          </div>
        </div>

        {/* DIP HISTORY */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100">
            <h3 className="text-xl font-bold text-slate-800">Dip History</h3>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Negative variance = fuel missing compared with the books. Repeated losses point to leaks, theft or unrecorded sales.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-6 py-3">When</th>
                  <th className="px-6 py-3">Tank</th>
                  <th className="px-6 py-3 text-right">Book</th>
                  <th className="px-6 py-3 text-right">Measured</th>
                  <th className="px-6 py-3 text-right">Variance</th>
                  <th className="px-6 py-3 text-right">Sold since last</th>
                  <th className="px-6 py-3 text-center">Result</th>
                  <th className="px-6 py-3">By / Note</th>
                </tr>
              </thead>
              <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                {dips.map((d) => (
                  <tr key={d.id}>
                    <td className="px-6 py-3 text-xs font-bold text-slate-600">{new Date(d.recordedAt).toLocaleString()}</td>
                    <td className="px-6 py-3 font-bold">{d.fuelType}</td>
                    <td className="px-6 py-3 text-right">{fmtL(d.bookStock, 2)}</td>
                    <td className="px-6 py-3 text-right">{fmtL(d.measuredStock, 2)}</td>
                    <td className={`px-6 py-3 text-right font-black ${d.variance < 0 ? "text-red-600" : d.variance > 0 ? "text-blue-600" : "text-emerald-600"}`}>{signed(d.variance)}</td>
                    <td className="px-6 py-3 text-right text-slate-500">{fmtL(d.salesSinceLastDip)}</td>
                    <td className="px-6 py-3 text-center">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${d.withinTolerance ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                        {d.withinTolerance ? "OK" : `Over ±${d.tolerance.toFixed(0)} L`}
                      </span>
                      {d.adjusted && <span className="ml-1.5 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 border border-slate-200">Adjusted</span>}
                    </td>
                    <td className="px-6 py-3 text-xs">
                      <span className="font-bold text-slate-700">{d.recordedBy}</span>
                      {d.note && <span className="text-slate-500"> — {d.note}</span>}
                    </td>
                  </tr>
                ))}
                {dips.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-10 text-center text-slate-400">No dips recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* PRICE HISTORY */}
      <div className="max-w-7xl mx-auto mt-8 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-800">Pump Price History</h3>
          <p className="text-xs font-medium text-slate-500 mt-0.5">Every pump price change, whether set on the dashboard or while receiving a delivery.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-6 py-3">When</th>
                <th className="px-6 py-3">Fuel</th>
                <th className="px-6 py-3 text-right">Old</th>
                <th className="px-6 py-3 text-right">New</th>
                <th className="px-6 py-3">Source</th>
                <th className="px-6 py-3">By</th>
              </tr>
            </thead>
            <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
              {priceHistory.map((h) => {
                const up = h.oldPrice != null && h.newPrice > h.oldPrice;
                return (
                  <tr key={h.id}>
                    <td className="px-6 py-3 text-xs font-bold text-slate-600">{new Date(h.changedAt).toLocaleString()}</td>
                    <td className="px-6 py-3 font-bold">{h.fuelType}</td>
                    <td className="px-6 py-3 text-right text-slate-500">{h.oldPrice != null ? `Rs. ${h.oldPrice.toFixed(2)}` : "—"}</td>
                    <td className={`px-6 py-3 text-right font-black ${h.oldPrice == null ? "text-slate-900" : up ? "text-red-600" : "text-emerald-600"}`}>Rs. {h.newPrice.toFixed(2)}</td>
                    <td className="px-6 py-3 text-xs font-bold text-slate-500">{h.source === "DELIVERY" ? `Delivery ${h.reference ?? ""}` : "Manual"}</td>
                    <td className="px-6 py-3 text-xs font-bold text-slate-700">{h.changedBy}</td>
                  </tr>
                );
              })}
              {priceHistory.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">No price changes recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DIP RESULT MODAL */}
      {dipResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-200">
            <h3 className={`text-xl font-black mb-3 ${dipResult.withinTolerance ? "text-emerald-700" : "text-red-700"}`}>
              {dipResult.withinTolerance ? "Dip Within Tolerance" : "Dip Variance Flagged"}
            </h3>
            <ul className="space-y-1.5 text-sm font-medium text-slate-600 mb-6">
              <li>{dipResult.fuelType}: measured {fmtL(dipResult.measuredStock, 2)} vs book {fmtL(dipResult.bookStock, 2)}.</li>
              <li>Variance {signed(dipResult.variance)} (allowed ±{dipResult.tolerance.toFixed(2)} L on {fmtL(dipResult.salesSinceLastDip)} sold since the last dip).</li>
              <li>{dipResult.adjusted ? "Book stock was adjusted to the measured figure." : "Book stock was left unchanged."}</li>
              {!dipResult.withinTolerance && !dipResult.adjusted && (
                <li className="font-bold text-red-700">Investigate before adjusting: check for leaks, unrecorded sales, or a mis-measured delivery.</li>
              )}
            </ul>
            <button onClick={() => setDipResult(null)} className="w-full px-4 py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800">OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
