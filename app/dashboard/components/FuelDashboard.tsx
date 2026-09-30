"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import api from "../../../utils/axiosInstance";
import { getErrorMessage } from "../../../utils/apiError";

interface FuelTank {
  tankId: number;
  fuelType: string;
  capacity: number;
  currentStock: number;
  pricePerLiter: number;
  reorderLevel?: number | null;
}

interface PumpAssignment {
  id: number;
  pumpNumber: number;
  attendantUsername: string;
  shiftStartedAt: string;
  openingMeterReading?: number | null;
}

interface UserAccount {
  id: number;
  username: string;
  fullName: string;
  role: string;
}

// Today's totals, computed by the server (voided sales excluded; an
// attendant's summary covers only their own sales).
interface SalesSummary {
  transactions: number;
  liters: number;
  revenue: number;
  cashRevenue: number;
  nonCashRevenue: number;
}

interface ShiftHandover {
  id: number;
  pumpNumber: number;
  attendantUsername: string;
  shiftStartedAt: string;
  shiftEndedAt: string;
  expectedCash: number;
  recordedLiters?: number | null;
  openingMeterReading?: number | null;
  status: string;
  reviewNote?: string | null;
  reviewedBy?: string | null;
}

// Handovers where the supervisor still has to enter a real cash count.
const NEEDS_COUNT_STATUSES = ["NEEDS_COUNT", "SYSTEM_FORCE_CLOSED", "REJECTED"];

type CountModal = {
  isOpen: boolean;
  mode: "close" | "count";
  pumpNumber: number | null;
  handoverId: number | null;
  attendant: string;
  openingMeter: number | null | undefined;
  declaredCash: string;
  closingMeter: string;
  isSubmitting: boolean;
  error: string;
};

const EMPTY_COUNT_MODAL: CountModal = {
  isOpen: false, mode: "close", pumpNumber: null, handoverId: null, attendant: "",
  openingMeter: null, declaredCash: "", closingMeter: "", isSubmitting: false, error: "",
};

export default function FuelDashboard({ userName }: { userName?: string }) {
  const { user } = useAuth();

  const [tanks, setTanks] = useState<FuelTank[]>([]);
  const [assignments, setAssignments] = useState<PumpAssignment[]>([]);
  const [attendants, setAttendants] = useState<UserAccount[]>([]);
  const [pumps, setPumps] = useState<number[]>([]);
  const [handoversToCount, setHandoversToCount] = useState<ShiftHandover[]>([]);
  const [today, setToday] = useState<SalesSummary | null>(null);
  const [loadError, setLoadError] = useState("");
  const [assignInput, setAssignInput] = useState<{ [key: number]: string }>({});
  const [meterInput, setMeterInput] = useState<{ [key: number]: string }>({});
  const [assigningPump, setAssigningPump] = useState<number | null>(null);
  const [priceInput, setPriceInput] = useState<{ [key: number]: string }>({});
  const [savingPriceFor, setSavingPriceFor] = useState<number | null>(null);
  const [newTankType, setNewTankType] = useState("");
  const [newTankCapacity, setNewTankCapacity] = useState("");
  const [isCreatingTank, setIsCreatingTank] = useState(false);

  // Replaces browser alert() pop-ups.
  const [notice, setNotice] = useState<{ title: string; lines: string[]; tone: "success" | "warning" | "error" } | null>(null);

  // Matches the fuel types the POS page's sale form already assumes exist.
  const ALL_FUEL_TYPES = ["Petrol 92", "Petrol 95", "Auto Diesel", "Super Diesel"];

  const [countModal, setCountModal] = useState<CountModal>(EMPTY_COUNT_MODAL);

  // Owners can view the station but, like the backend, can't run shifts.
  const isManagement = user?.role === "FUEL_STATION_SUPERVISOR" || user?.role === "SUPER_ADMIN" || user?.role === "EXECUTIVE_OWNER";
  const canOperate = user?.role === "FUEL_STATION_SUPERVISOR" || user?.role === "SUPER_ADMIN";

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [activeRes, summaryRes, pumpsRes] = await Promise.all([
        api.get<PumpAssignment[]>("/pumps/active"),
        api.get<SalesSummary>("/fuel/summary"),
        api.get<number[]>("/pumps/numbers"),
      ]);
      setAssignments(activeRes.data);
      setToday(summaryRes.data);
      setPumps(pumpsRes.data);

      if (isManagement) {
        const [tanksRes, attendantsRes, handoversRes] = await Promise.all([
          api.get<FuelTank[]>("/tanks"),
          api.get<UserAccount[]>("/pumps/attendants"),
          api.get<ShiftHandover[]>("/pumps/handovers"),
        ]);
        setTanks(tanksRes.data);
        setAttendants(attendantsRes.data);
        setHandoversToCount(handoversRes.data.filter((h) => NEEDS_COUNT_STATUSES.includes(h.status)));
      }
      setLoadError("");
    } catch (err) {
      setLoadError(getErrorMessage(err, "Couldn't load station data. Check that the server is running."));
    }
  }, [user, isManagement]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAssignPump = async (pumpNumber: number) => {
    const attendantUsername = assignInput[pumpNumber];
    const meter = parseFloat(meterInput[pumpNumber]);
    if (!attendantUsername) return;
    if (!meterInput[pumpNumber] || isNaN(meter) || meter < 0) {
      setNotice({ title: "Opening Meter Required", lines: ["Read the pump's totalizer meter and enter it before opening the shift."], tone: "error" });
      return;
    }

    setAssigningPump(pumpNumber);
    try {
      await api.post("/pumps/assign", { pumpNumber, attendantUsername, openingMeterReading: meter });
      setAssignInput({ ...assignInput, [pumpNumber]: "" });
      setMeterInput({ ...meterInput, [pumpNumber]: "" });
      fetchData();
    } catch (err) {
      setNotice({ title: "Couldn't Open Shift", lines: [getErrorMessage(err, "Failed to assign pump.")], tone: "error" });
    } finally {
      setAssigningPump(null);
    }
  };

  // NEW: without this, a tank's price could never move off its database
  // default of 0.0 — which meant every sale at the pump was permanently
  // rejected server-side with "Pricing Error: Fuel price is not configured."
  const handleSavePrice = async (tankId: number) => {
    const raw = priceInput[tankId];
    const parsed = parseFloat(raw);
    if (!raw || isNaN(parsed) || parsed <= 0) {
      setNotice({ title: "Invalid Price", lines: ["Enter a price greater than 0 before saving."], tone: "error" });
      return;
    }
    setSavingPriceFor(tankId);
    try {
      await api.put(`/tanks/${tankId}/price`, { pricePerLiter: parsed });
      setPriceInput({ ...priceInput, [tankId]: "" });
      fetchData();
    } catch (err) {
      setNotice({ title: "Price Not Saved", lines: [getErrorMessage(err, "Failed to update the price.")], tone: "error" });
    } finally {
      setSavingPriceFor(null);
    }
  };

  const handleCreateTank = async () => {
    const capacity = parseFloat(newTankCapacity);
    if (!newTankType || !newTankCapacity || isNaN(capacity) || capacity <= 0) {
      setNotice({ title: "Missing Details", lines: ["Select a fuel type and enter a capacity greater than 0."], tone: "error" });
      return;
    }
    setIsCreatingTank(true);
    try {
      await api.post("/tanks", { fuelType: newTankType, capacity });
      setNewTankType("");
      setNewTankCapacity("");
      fetchData();
    } catch (err) {
      setNotice({ title: "Tank Not Created", lines: [getErrorMessage(err, "Failed to create the tank.")], tone: "error" });
    } finally {
      setIsCreatingTank(false);
    }
  };

  // Close a live shift, or enter the count for an auto-closed / rejected one.
  const submitCount = async () => {
    const cash = parseFloat(countModal.declaredCash);
    const meter = parseFloat(countModal.closingMeter);
    if (countModal.declaredCash === "" || isNaN(cash) || cash < 0) {
      setCountModal({ ...countModal, error: "Enter the cash you physically counted (0 if the drawer is empty)." });
      return;
    }
    if (countModal.closingMeter === "" || isNaN(meter) || meter < 0) {
      setCountModal({ ...countModal, error: "Enter the pump's closing meter reading." });
      return;
    }
    if (countModal.openingMeter != null && meter < countModal.openingMeter) {
      setCountModal({ ...countModal, error: `Closing meter can't be below the opening reading (${countModal.openingMeter}).` });
      return;
    }

    setCountModal({ ...countModal, isSubmitting: true, error: "" });
    try {
      const body = { declaredCash: cash, closingMeterReading: meter };
      const res = countModal.mode === "close"
        ? await api.post(`/pumps/close-shift/${countModal.pumpNumber}`, body)
        : await api.put(`/pumps/handovers/${countModal.handoverId}/count`, body);

      const { variance, literVariance, meterLiters, recordedLiters, nonCashSales } = res.data;
      const lines: string[] = [];
      if (variance < 0) lines.push(`Cash SHORT by ${formatLKR(Math.abs(variance))}.`);
      else if (variance > 0) lines.push(`Cash OVER by ${formatLKR(variance)}.`);
      else lines.push("Cash balanced to the cent.");
      if (nonCashSales > 0) lines.push(`Card/QR sales of ${formatLKR(nonCashSales)} are settled by the bank and aren't expected in the drawer.`);
      if (literVariance == null) {
        lines.push("Meter not reconciled — this shift was opened without an opening meter reading.");
      } else {
        lines.push(`Meter: ${meterLiters.toFixed(2)} L dispensed vs ${recordedLiters.toFixed(2)} L rung up (${literVariance > 0 ? "+" : ""}${literVariance.toFixed(2)} L).`);
        if (literVariance > 1) lines.push("More fuel left the pump than was sold — check for unrecorded sales.");
      }
      lines.push("The handover has been sent to Finance for approval.");

      const balanced = variance === 0 && (literVariance == null || Math.abs(literVariance) <= 1);
      setNotice({ title: balanced ? "Shift Balanced" : "Shift Variance Recorded", lines, tone: balanced ? "success" : "warning" });
      setCountModal(EMPTY_COUNT_MODAL);
      fetchData();
    } catch (err) {
      setCountModal((m) => ({ ...m, isSubmitting: false, error: getErrorMessage(err, "Failed to close the shift.") }));
    }
  };

  const formatLKR = (amt: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amt);

  const noticeModal = notice && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full border border-slate-200">
        <h3 className={`text-xl font-black mb-3 ${notice.tone === "success" ? "text-emerald-700" : notice.tone === "warning" ? "text-amber-700" : "text-red-700"}`}>{notice.title}</h3>
        <ul className="space-y-1.5 mb-6">
          {notice.lines.map((l, i) => <li key={i} className="text-sm font-medium text-slate-600">{l}</li>)}
        </ul>
        <button onClick={() => setNotice(null)} className="w-full px-4 py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800">OK</button>
      </div>
    </div>
  );

  // --- ATTENDANT LANDING DASHBOARD ---
  if (!isManagement) {
    const myAssignment = assignments.find(a => a.attendantUsername === user?.username);

    return (
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in-up pt-8 px-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Attendant Portal</h1>
          <p className="text-slate-500 font-medium mt-2">Welcome back, {userName}. Have a great shift.</p>
        </div>

        {loadError && <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm font-bold text-red-700">{loadError}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`p-8 rounded-3xl border shadow-sm relative overflow-hidden flex flex-col justify-between ${myAssignment ? 'bg-white border-blue-500 ring-4 ring-blue-500/10' : 'bg-white border-slate-200'}`}>
            <div className="relative z-10">
              <h3 className={`text-xs font-black uppercase tracking-widest mb-4 ${myAssignment ? 'text-blue-600' : 'text-slate-400'}`}>Current Assignment</h3>
              {myAssignment ? (
                <>
                  <div className="text-6xl font-black text-slate-900 mb-4 tracking-tighter">Pump {myAssignment.pumpNumber}</div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-slate-500">
                      Shift Started: <span className="text-slate-900">{new Date(myAssignment.shiftStartedAt).toLocaleString()}</span>
                    </p>
                    <p className="text-xs font-black text-emerald-600 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                      Authorized for POS operations
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-4xl font-black text-slate-900 mb-2">Standby</div>
                  <p className="text-sm font-medium text-slate-500">Awaiting supervisor allocation.</p>
                </>
              )}
            </div>

            <div className="mt-8 relative z-10 flex flex-col gap-3">
              <Link href={myAssignment ? "/fuel" : "#"} className={`w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 ${myAssignment ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                {myAssignment ? "Launch POS Terminal" : "POS Locked"}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </Link>

              {/* The cash count is done by the supervisor, not the person
                  who handled the cash — the attendant can't close their own shift. */}
              {myAssignment && (
                <p className="text-[11px] font-bold text-slate-500 text-center">
                  At the end of your shift, hand your cash drawer to the supervisor. They count it, read the pump meter and close the shift.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-6 flex flex-col">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col justify-center">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">My Sales (Today)</h3>
              <div className="text-4xl font-black text-emerald-500">{formatLKR(today?.revenue ?? 0)}</div>
              <p className="text-xs font-medium text-slate-500 mt-2">
                {today ? `${today.transactions} sales · ${today.liters.toLocaleString()} L · cash ${formatLKR(today.cashRevenue)}` : "Excluding voided transactions."}
              </p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col justify-center hover:border-slate-300 transition-colors group">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Human Resources</h3>
                <div className="text-xl font-black text-slate-900">Salary & Payslips</div>
              </div>
              <Link href="/salary/my-payslips" className="mt-4 px-4 py-3 bg-slate-50 group-hover:bg-slate-100 rounded-xl text-xs font-black uppercase tracking-widest text-slate-700 transition-colors flex items-center justify-between">
                Access HR Portal <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- SUPERVISOR MASTER VIEW ---
  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Fuel Station Command</h1>
          <p className="text-slate-500 font-medium mt-2">Welcome back, {userName}. Shift roster and live operations.</p>
        </div>
      </div>

      {loadError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm font-bold text-red-700 flex justify-between items-center gap-4">
          <span>{loadError}</span>
          <button onClick={fetchData} className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-black uppercase tracking-widest">Retry</button>
        </div>
      )}

      {/* SHIFTS WAITING FOR A CASH COUNT */}
      {canOperate && handoversToCount.length > 0 && (
        <div className="bg-amber-50 p-6 rounded-3xl border border-amber-200">
          <h3 className="text-lg font-black text-amber-900 mb-1">Shifts Awaiting Cash Count</h3>
          <p className="text-xs font-medium text-amber-800 mb-4">
            These shifts were auto-closed after running too long, or were sent back by Finance. Count the cash and read the pump meter to send them for approval.
          </p>
          <div className="space-y-3">
            {handoversToCount.map((h) => (
              <div key={h.id} className="bg-white p-4 rounded-2xl border border-amber-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <p className="font-black text-slate-900">Pump {h.pumpNumber} — {h.attendantUsername}</p>
                  <p className="text-[11px] font-bold text-slate-500">
                    {new Date(h.shiftStartedAt).toLocaleString()} → {h.shiftEndedAt ? new Date(h.shiftEndedAt).toLocaleString() : "—"} · Expected {formatLKR(h.expectedCash)}
                  </p>
                  {h.status === "REJECTED" && h.reviewNote && (
                    <p className="text-[11px] font-bold text-red-600 mt-1">Rejected by {h.reviewedBy}: {h.reviewNote}</p>
                  )}
                </div>
                <button
                  onClick={() => setCountModal({
                    ...EMPTY_COUNT_MODAL, isOpen: true, mode: "count", handoverId: h.id, pumpNumber: h.pumpNumber,
                    attendant: h.attendantUsername, openingMeter: h.openingMeterReading,
                  })}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                >
                  {h.status === "REJECTED" ? "Recount" : "Enter Count"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-3xl shadow-lg text-white flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Today&apos;s Pump Revenue</h3>
            <div className="text-4xl font-black text-emerald-400">{formatLKR(today?.revenue ?? 0)}</div>
            {today && (
              <p className="text-xs font-bold text-slate-400 mt-2">
                {today.transactions} sales · {today.liters.toLocaleString()} L<br />
                Cash {formatLKR(today.cashRevenue)} · Card/QR {formatLKR(today.nonCashRevenue)}
              </p>
            )}
          </div>
          <Link href="/fuel" className="mt-8 px-5 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-between">
            Open POS Terminal <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </Link>
        </div>

        <div className="md:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
           <div>
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Underground Tank Status</h3>
               <Link href="/tanks" className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:underline">Wet stock & dips →</Link>
             </div>
             <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
               {tanks.map(tank => {
                 // Configured reorder level, else the old 20%-of-capacity rule.
                 const isLow = tank.currentStock <= (tank.reorderLevel ?? tank.capacity * 0.2);
                 const isUnpriced = !tank.pricePerLiter || tank.pricePerLiter <= 0;
                 return (
                   <div key={tank.tankId} className={`p-4 rounded-2xl border ${isLow ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                     <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 truncate">{tank.fuelType}</div>
                     <div className={`text-xl font-black ${isLow ? 'text-red-600' : 'text-slate-900'}`}>{tank.currentStock.toLocaleString(undefined, { maximumFractionDigits: 0 })}<span className="text-xs ml-1 font-bold">L</span></div>
                     {isLow && <p className="text-[9px] font-black uppercase tracking-widest text-red-600 mt-0.5">Below reorder level</p>}

                     <div className="mt-3 pt-3 border-t border-slate-200/70">
                       {isUnpriced && (
                         <p className="text-[9px] font-black uppercase tracking-widest text-red-600 mb-1.5">⚠ Not priced — sales blocked</p>
                       )}
                       {canOperate && (
                       <div className="flex items-center gap-1.5">
                         <span className="text-[10px] font-bold text-slate-400 flex-shrink-0">Rs.</span>
                         <input
                           type="number" step="0.01" min="0.01"
                           placeholder={isUnpriced ? "Set price" : tank.pricePerLiter.toFixed(2)}
                           value={priceInput[tank.tankId] || ""}
                           onChange={(e) => setPriceInput({ ...priceInput, [tank.tankId]: e.target.value })}
                           className="w-full min-w-0 px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-bold outline-none focus:border-blue-500"
                         />
                         <button
                           onClick={() => handleSavePrice(tank.tankId)}
                           disabled={savingPriceFor === tank.tankId || !priceInput[tank.tankId]}
                           className="flex-shrink-0 px-2.5 py-1 bg-slate-900 hover:bg-blue-600 disabled:opacity-40 text-white text-[10px] font-black uppercase tracking-wider rounded-md transition-colors"
                         >
                           {savingPriceFor === tank.tankId ? "..." : "Save"}
                         </button>
                       </div>
                       )}
                       {!isUnpriced && <p className="text-[9px] font-bold text-slate-400 mt-1">Current: Rs. {tank.pricePerLiter.toFixed(2)} / L</p>}
                     </div>
                   </div>
                 );
               })}
               {tanks.length === 0 && (
                 <div className="col-span-full text-xs font-bold text-slate-400">
                   {loadError ? "Tank data unavailable." : "No tanks set up yet."}
                 </div>
               )}
             </div>
             {canOperate && (() => {
               const missingFuelTypes = ALL_FUEL_TYPES.filter(ft => !tanks.some(tank => tank.fuelType === ft));
               if (missingFuelTypes.length === 0) return null;
               return (
                 <div className="mt-4 pt-4 border-t border-slate-100">
                   <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">
                     {missingFuelTypes.length} fuel type{missingFuelTypes.length > 1 ? "s" : ""} have no tank yet — attendants can&apos;t sell {missingFuelTypes.length > 1 ? "them" : "it"}.
                   </p>
                   <div className="flex flex-wrap items-center gap-2">
                     <select
                       value={newTankType}
                       onChange={(e) => setNewTankType(e.target.value)}
                       className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 cursor-pointer"
                     >
                       <option value="">-- Select fuel type --</option>
                       {missingFuelTypes.map(ft => <option key={ft} value={ft}>{ft}</option>)}
                     </select>
                     <input
                       type="number" min="1" placeholder="Capacity (L)"
                       value={newTankCapacity}
                       onChange={(e) => setNewTankCapacity(e.target.value)}
                       className="w-32 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                     />
                     <button
                       onClick={handleCreateTank}
                       disabled={isCreatingTank || !newTankType || !newTankCapacity}
                       className="px-4 py-2 bg-slate-900 hover:bg-blue-600 disabled:opacity-40 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors"
                     >
                       {isCreatingTank ? "Adding..." : "+ Add Tank"}
                     </button>
                   </div>
                 </div>
               );
             })()}
           </div>

           <Link href="/fuel-deliveries" className="mt-6 px-5 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-700 transition-colors flex items-center justify-center gap-2">
             Order & Receive Fuel Deliveries <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
           </Link>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h3 className="text-xl font-black text-slate-900 mb-6">Active Pump Roster</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pumps.map(pumpNum => {
            const activeAssignment = assignments.find(a => a.pumpNumber === pumpNum);

            return (
              <div key={pumpNum} className={`p-5 rounded-2xl border transition-all ${activeAssignment ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex justify-between items-center mb-4">
                  <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-sm">
                    {pumpNum}
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${activeAssignment ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                    {activeAssignment ? 'Operational' : 'Offline'}
                  </span>
                </div>

                {activeAssignment ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assigned Attendant</p>
                      <p className="text-base font-black text-slate-900 truncate">{activeAssignment.attendantUsername}</p>
                      <p className="text-[10px] font-bold text-blue-600 mt-1">Shift started: {new Date(activeAssignment.shiftStartedAt).toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                        Opening meter: {activeAssignment.openingMeterReading != null ? activeAssignment.openingMeterReading.toFixed(2) : "not recorded"}
                      </p>
                    </div>

                    {canOperate && (
                      <button
                        onClick={() => setCountModal({
                          ...EMPTY_COUNT_MODAL, isOpen: true, mode: "close", pumpNumber: pumpNum,
                          attendant: activeAssignment.attendantUsername, openingMeter: activeAssignment.openingMeterReading,
                        })}
                        className="w-full py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors"
                      >
                        Reconcile & End Shift
                      </button>
                    )}
                  </div>
                ) : canOperate ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Assign Attendant</p>
                      {(() => {
                        // The backend refuses to assign someone already
                        // working another pump, so don't offer them.
                        const busyElsewhere = new Set(assignments.map(a => a.attendantUsername));
                        const availableAttendants = attendants.filter(att => !busyElsewhere.has(att.username));
                        return (
                          <>
                            <select
                              value={assignInput[pumpNum] || ""}
                              onChange={(e) => setAssignInput({...assignInput, [pumpNum]: e.target.value})}
                              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 cursor-pointer"
                            >
                              <option value="">-- Select Attendant --</option>
                              {availableAttendants.map(att => (
                                 <option key={att.id} value={att.username}>{att.fullName || att.username}</option>
                              ))}
                            </select>
                            {availableAttendants.length === 0 && (
                              <p className="text-[9px] font-bold text-amber-600 mt-1.5">All attendants are already working a pump.</p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Opening Meter (L)</p>
                      <input
                        type="number" step="0.01" min="0" placeholder="Totalizer reading"
                        value={meterInput[pumpNum] || ""}
                        onChange={(e) => setMeterInput({ ...meterInput, [pumpNum]: e.target.value })}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                      />
                    </div>
                    <button
                      onClick={() => handleAssignPump(pumpNum)}
                      disabled={!assignInput[pumpNum] || !meterInput[pumpNum] || assigningPump === pumpNum}
                      className="w-full py-2 bg-slate-900 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all active:scale-95"
                    >
                      {assigningPump === pumpNum ? "Opening..." : "Open Shift"}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-slate-400">No shift open.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- CLOSE SHIFT / ENTER COUNT MODAL --- */}
      {countModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-1">
              {countModal.mode === "close" ? "Close Shift" : "Enter Shift Count"}
            </h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Pump {countModal.pumpNumber} · {countModal.attendant}</p>
            <p className="text-slate-500 text-xs mb-6 font-medium">
              Count the drawer and read the pump&apos;s totalizer meter. Both are compared against the POS ledger, and any difference is recorded for Finance.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Counted Cash (LKR)</label>
              <input
                type="number" step="0.01" min="0" placeholder="e.g., 45000.00" autoFocus
                value={countModal.declaredCash}
                onChange={(e) => setCountModal({ ...countModal, declaredCash: e.target.value, error: "" })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-500 font-black text-slate-900"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Closing Meter (L)</label>
              <input
                type="number" step="0.01" min="0"
                placeholder={countModal.openingMeter != null ? `Opened at ${countModal.openingMeter}` : "Totalizer reading"}
                value={countModal.closingMeter}
                onChange={(e) => setCountModal({ ...countModal, closingMeter: e.target.value, error: "" })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-500 font-black text-slate-900"
              />
            </div>

            {countModal.error && <p className="mb-4 text-xs font-bold text-red-600">{countModal.error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setCountModal(EMPTY_COUNT_MODAL)} disabled={countModal.isSubmitting} className="flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={submitCount} disabled={countModal.isSubmitting} className="flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-white bg-slate-900 hover:bg-blue-600 disabled:opacity-60 shadow-md transition-all active:scale-95">
                {countModal.isSubmitting ? "Submitting..." : countModal.mode === "close" ? "Close & Send to Finance" : "Send to Finance"}
              </button>
            </div>
          </div>
        </div>
      )}

      {noticeModal}
    </div>
  );
}
