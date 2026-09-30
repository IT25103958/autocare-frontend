"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";

interface ServiceBooking {
  bookingID: number;
  vehicleRegNo: string;
  servicePackage: string;
  status: string;
  assignedServiceBay?: string;
  assignedTechnicianID?: number;
  managerNotes?: string;
  technicianName?: string;
}

interface StaffShift {
  shiftId: number;
  shiftDate: string;
  shiftType: string;
  status: string;
}

export default function TechnicianDashboard() {
  const { user } = useAuth();
  const [activeJobs, setActiveJobs] = useState<ServiceBooking[]>([]);
  const [historyJobs, setHistoryJobs] = useState<ServiceBooking[]>([]);
  const [upcomingShifts, setUpcomingShifts] = useState<StaffShift[]>([]);
  const [queueCount, setQueueCount] = useState(0);

  const fetchDashboardData = async () => {
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` };

      // 1. Jobs assigned to this technician (server-side, by login)
      const mineRes = await axios.get("http://localhost:8080/api/bookings/my-jobs", { headers });
      const myJobs: ServiceBooking[] = mineRes.data;

      setActiveJobs(myJobs.filter(b => ["CONFIRMED", "IN_PROGRESS", "DELAYED"].includes(b.status)));
      setHistoryJobs(myJobs.filter(b => ["COMPLETED", "PAID", "CANCELLED"].includes(b.status))
        .sort((a, b) => b.bookingID - a.bookingID));

      // Bookings waiting for the manager to confirm (context only)
      const allRes = await axios.get("http://localhost:8080/api/bookings", { headers }).catch(() => ({ data: [] }));
      setQueueCount((allRes.data as ServiceBooking[]).filter(b => b.status === "PENDING").length);

      // 2. Fetch Upcoming Roster Shifts
      {
        const shiftRes = await axios.get("http://localhost:8080/api/roster/my", { headers });
        const allShifts: StaffShift[] = shiftRes.data;

        // Filter for shifts that are SCHEDULED or CONFIRMED (ignoring completed/absent ones for the alert box)
        setUpcomingShifts(allShifts.filter(s => s.status === "SCHEDULED" || s.status === "CONFIRMED")
          .sort((a, b) => new Date(a.shiftDate).getTime() - new Date(b.shiftDate).getTime()));
      }

    } catch (error) {
      console.error("Failed to fetch technician dashboard data");
    }
  };

  useEffect(() => {
    if (user) fetchDashboardData();
  }, [user]);

  return (
    <div className="space-y-8 animate-fade-in-up max-w-5xl mx-auto pb-12">

      {/* HEADER BANNER */}
      <div className="bg-slate-900 p-8 rounded-[2rem] shadow-xl text-white flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-3xl font-black tracking-tight mb-2">Welcome back, {user?.fullName || user?.username || 'Technician'}</h2>
          <p className="text-slate-400 font-medium">You have <strong className="text-white">{activeJobs.length}</strong> assigned job(s); <strong className="text-white">{queueCount}</strong> booking(s) are waiting for the manager to confirm.</p>
        </div>
        <Link href="/bookings" className="relative z-10 px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-blue-600/30 transition-all">
          Open Digital Job Cards
        </Link>
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* --- NEW: ROSTER NOTIFICATION ALERT --- */}
      {upcomingShifts.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-3xl p-6 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-blue-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Upcoming Scheduled Shifts
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingShifts.slice(0, 3).map((shift) => (
              <div key={shift.shiftId} className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm flex justify-between items-center">
                <div>
                  <p className="text-slate-900 font-bold">{new Date(shift.shiftDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  <p className="text-[10px] text-blue-600 font-black uppercase tracking-wider mt-0.5">{shift.shiftType}</p>
                </div>
                <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${
                  shift.status === 'SCHEDULED' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  {shift.status}
                </span>
              </div>
            ))}
          </div>
          {upcomingShifts.length > 3 && (
            <div className="mt-4 text-right">
              <Link href="/roster" className="text-xs font-bold text-blue-600 hover:text-blue-800">View Full Schedule &rarr;</Link>
            </div>
          )}
        </div>
      )}

      {/* ACTIVE FLOOR BAYS */}
      <div>
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-4 ml-2">My Assigned Jobs</h3>
        {activeJobs.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h4 className="text-lg font-bold text-slate-700">No jobs assigned</h4>
            <p className="text-slate-500 text-sm mt-1">The service center manager will assign jobs to you here.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {activeJobs.map(job => {
              return (
              <div key={job.bookingID} className="bg-white border border-blue-200 rounded-3xl p-6 shadow-md shadow-blue-900/5 relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-2xl font-black text-slate-900">{job.vehicleRegNo}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{job.assignedServiceBay || "General Bay"}</p>
                        {job.technicianName && <p className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">Tech: {job.technicianName}</p>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border ${
                      job.status === "DELAYED" ? "text-orange-800 bg-orange-50 border-orange-200"
                      : job.status === "IN_PROGRESS" ? "text-blue-600 bg-blue-50 border-blue-100 animate-pulse"
                      : "text-slate-700 bg-slate-50 border-slate-200"}`}>
                      {job.status === "CONFIRMED" ? "UP NEXT" : job.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Service Required</span>
                      <span className="text-sm font-bold text-slate-800">{job.servicePackage}</span>
                    </div>
                  </div>
                </div>
                <div className="pt-4 mt-4 border-t border-slate-100 flex justify-end">
                  <Link href="/bookings" className="text-xs font-bold text-blue-600 hover:text-blue-800">Open job card &rarr;</Link>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

      {/* --- RESTORED: JOB HISTORY GRID --- */}
      <div>
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-4 ml-2">My Recent Task History</h3>
        {historyJobs.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center shadow-sm">
            <p className="text-slate-500 text-sm font-medium">No finished or cancelled tasks found in your history.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {historyJobs.slice(0, 9).map(job => (
              <div key={job.bookingID} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm opacity-90 hover:opacity-100 transition-opacity">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-black text-slate-800">{job.vehicleRegNo}</h4>
                  {job.status === "COMPLETED" || job.status === "PAID" ? (
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md">FINISHED</span>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">CANCELLED</span>
                  )}
                </div>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 truncate max-w-[60%]">{job.servicePackage}</span>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded">
                    {job.status === 'CANCELLED' ? 'Aborted' : 'Done'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}