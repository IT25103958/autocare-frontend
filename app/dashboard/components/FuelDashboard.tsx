"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";

interface FuelTank {
  tankId: number;
  fuelType: string;
  capacity: number;
  currentStock: number;
}

interface PumpAssignment {
  id: number;
  pumpNumber: number;
  attendantUsername: string;
  shiftStartedAt: string;
}

interface UserAccount {
  id: number;
  username: string;
  fullName: string;
  role: string;
}

export default function FuelDashboard({ userName }: { userName?: string }) {
  const { user } = useAuth();

  const [tanks, setTanks] = useState<FuelTank[]>([]);
  const [assignments, setAssignments] = useState<PumpAssignment[]>([]);
  const [attendants, setAttendants] = useState<UserAccount[]>([]);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [assignInput, setAssignInput] = useState<{ [key: number]: string }>({});

  // NEW: Secure Reconciliation Modal State
  const [shiftModal, setShiftModal] = useState<{ isOpen: boolean; pumpNumber: number | null; declaredCash: string }>({
    isOpen: false, pumpNumber: null, declaredCash: ""
  });

  const isManagement = user?.role === "FUEL_STATION_SUPERVISOR" || user?.role === "SUPER_ADMIN" || user?.role === "EXECUTIVE_OWNER";

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  const fetchData = async () => {
    try {
      const endpoints = [
        axios.get("http://localhost:8080/api/pumps/active", getAuthHeader()).catch(() => ({ data: [] })),
        axios.get("http://localhost:8080/api/fuel", getAuthHeader()).catch(() => ({ data: [] }))
      ];

      if (isManagement) {
        endpoints.push(axios.get("http://localhost:8080/api/tanks", getAuthHeader()).catch(() => ({ data: [] })));
        endpoints.push(axios.get("http://localhost:8080/api/pumps/attendants", getAuthHeader()).catch(() => ({ data: [] })));
      }

      const results = await Promise.all(endpoints);
      setAssignments(results[0].data);

      const salesData = results[1].data;
      const today = new Date().toDateString();

      const revenue = salesData
        .filter((s: any) => new Date(s.saleDate).toDateString() === today)
        .filter((s: any) => isManagement ? true : s.attendantName === user?.username)
        .reduce((sum: number, s: any) => sum + s.totalCost, 0);
      setTodayRevenue(revenue);

      if (isManagement) {
        setTanks(results[2].data);
        setAttendants(results[3].data);
      }

    } catch (err) {
      console.error("Failed to load dashboard data");
    }
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const handleAssignPump = async (pumpNumber: number) => {
    const attendantUsername = assignInput[pumpNumber];
    if (!attendantUsername) return;

    try {
      await axios.post("http://localhost:8080/api/pumps/assign", { pumpNumber, attendantUsername }, getAuthHeader());
      setAssignInput({ ...assignInput, [pumpNumber]: "" });
      fetchData();
    } catch (error) {
      alert("Failed to assign pump. Check server connection.");
    }
  };

  const executeShiftClose = async () => {
    if (!shiftModal.pumpNumber) return;
    try {
      const res = await axios.post(`http://localhost:8080/api/pumps/close-shift/${shiftModal.pumpNumber}`, {
        declaredCash: parseFloat(shiftModal.declaredCash) || 0
      }, getAuthHeader());

      const { variance } = res.data;
      if (variance < 0) {
        alert(`⚠️ SHIFT SHORTAGE: Missing Rs. ${Math.abs(variance).toLocaleString(undefined, { minimumFractionDigits: 2 })}.\nThis variance has been permanently written to the Master Audit Log.`);
      } else if (variance > 0) {
        alert(`⚠️ SHIFT OVERAGE: Extra Rs. ${variance.toLocaleString(undefined, { minimumFractionDigits: 2 })} detected.\nThis variance has been logged.`);
      } else {
        alert("✅ Shift balanced perfectly to the cent. Excellent work.");
      }

      fetchData();
    } catch (err) {
      alert("Failed to securely close shift.");
    } finally {
      setShiftModal({ isOpen: false, pumpNumber: null, declaredCash: "" });
    }
  };

  const formatLKR = (amt: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amt);
  const PUMPS = [1, 2, 3, 4];

  // --- ATTENDANT LANDING DASHBOARD ---
  if (!isManagement) {
    const myAssignment = assignments.find(a => a.attendantUsername === user?.username);

    return (
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in-up pt-8 px-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Attendant Portal</h1>
          <p className="text-slate-500 font-medium mt-2">Welcome back, {userName}. Have a great shift.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`p-8 rounded-3xl border shadow-sm relative overflow-hidden flex flex-col justify-between ${myAssignment ? 'bg-white border-blue-500 ring-4 ring-blue-500/10' : 'bg-white border-slate-200'}`}>
            <div className="relative z-10">
              <h3 className={`text-xs font-black uppercase tracking-widest mb-4 ${myAssignment ? 'text-blue-600' : 'text-slate-400'}`}>Current Assignment</h3>
              {myAssignment ? (
                <>
                  <div className="text-6xl font-black text-slate-900 mb-4 tracking-tighter">Pump {myAssignment.pumpNumber}</div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-slate-500">
                      Shift Started: <span className="text-slate-900">{new Date(myAssignment.shiftStartedAt).toLocaleTimeString()}</span>
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

              {/* NEW: Attendant Shift Closure Trigger */}
              {myAssignment && (
                <button
                  onClick={() => setShiftModal({ isOpen: true, pumpNumber: myAssignment.pumpNumber, declaredCash: "" })}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-200 transition-colors"
                >
                  End Shift & Reconcile Drawer
                </button>
              )}
            </div>
          </div>

          <div className="space-y-6 flex flex-col">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col justify-center">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">My Shift Revenue (Today)</h3>
              <div className="text-4xl font-black text-emerald-500">{formatLKR(todayRevenue)}</div>
              <p className="text-xs font-medium text-slate-500 mt-2">Total revenue pumped during your active shift.</p>
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

        {/* --- RECONCILIATION MODAL --- */}
        {shiftModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full border border-slate-200">
              <h3 className="text-xl font-black text-slate-900 mb-2">Cash Declaration</h3>
              <p className="text-slate-500 text-xs mb-6 font-medium">Input the total physical cash in your drawer. Any variance against the digital ledger will be logged.</p>

              <div className="mb-6">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Counted Cash (LKR)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g., 45000.00"
                  value={shiftModal.declaredCash}
                  onChange={(e) => setShiftModal({...shiftModal, declaredCash: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-500 font-black text-slate-900"
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShiftModal({ isOpen: false, pumpNumber: null, declaredCash: "" })} className="flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button onClick={executeShiftClose} className="flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-white bg-slate-900 hover:bg-blue-600 shadow-md transition-all active:scale-95">
                  Confirm Handover
                </button>
              </div>
            </div>
          </div>
        )}
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-3xl shadow-lg text-white flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Today's Pump Revenue</h3>
            <div className="text-4xl font-black text-emerald-400">{formatLKR(todayRevenue)}</div>
          </div>
          <Link href="/fuel" className="mt-8 px-5 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-between">
            Open POS Terminal <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </Link>
        </div>

        <div className="md:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
           <div>
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Underground Tank Status</h3>
             <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
               {tanks.map(tank => {
                 const isLow = (tank.currentStock / tank.capacity) < 0.2;
                 return (
                   <div key={tank.tankId} className={`p-4 rounded-2xl border ${isLow ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                     <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 truncate">{tank.fuelType}</div>
                     <div className={`text-xl font-black ${isLow ? 'text-red-600' : 'text-slate-900'}`}>{tank.currentStock.toLocaleString(undefined, { maximumFractionDigits: 0 })}<span className="text-xs ml-1 font-bold">L</span></div>
                   </div>
                 );
               })}
               {tanks.length === 0 && <div className="col-span-full text-xs font-bold text-slate-400">Loading telemetry...</div>}
             </div>
           </div>

           <Link href="/tanks" className="mt-6 px-5 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-700 transition-colors flex items-center justify-center gap-2">
             Log Bowser Deliveries <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
           </Link>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h3 className="text-xl font-black text-slate-900 mb-6">Active Pump Roster</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PUMPS.map(pumpNum => {
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
                      <p className="text-[10px] font-bold text-blue-600 mt-1">Shift started: {new Date(activeAssignment.shiftStartedAt).toLocaleTimeString()}</p>
                    </div>

                    {/* FIXED: Supervisor Reconcile Button */}
                    <button
                      onClick={() => setShiftModal({ isOpen: true, pumpNumber: pumpNum, declaredCash: "" })}
                      className="w-full py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors"
                    >
                      Reconcile & End Shift
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Assign Attendant</p>
                      <select
                        value={assignInput[pumpNum] || ""}
                        onChange={(e) => setAssignInput({...assignInput, [pumpNum]: e.target.value})}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 cursor-pointer"
                      >
                        <option value="">-- Select Attendant --</option>
                        {attendants.map(att => (
                           <option key={att.id} value={att.username}>{att.fullName || att.username}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => handleAssignPump(pumpNum)}
                      disabled={!assignInput[pumpNum]}
                      className="w-full py-2 bg-slate-900 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all active:scale-95"
                    >
                      Allocate Pump
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- SUPERVISOR RECONCILIATION MODAL --- */}
      {shiftModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">Drawer Verification</h3>
            <p className="text-slate-500 text-xs mb-6 font-medium">Verify the physical cash handover. Any variance against the digital ledger will be officially audited.</p>

            <div className="mb-6">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Counted Cash (LKR)</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g., 45000.00"
                value={shiftModal.declaredCash}
                onChange={(e) => setShiftModal({...shiftModal, declaredCash: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-500 font-black text-slate-900"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShiftModal({ isOpen: false, pumpNumber: null, declaredCash: "" })} className="flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={executeShiftClose} className="flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-white bg-slate-900 hover:bg-blue-600 shadow-md transition-all active:scale-95">
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}