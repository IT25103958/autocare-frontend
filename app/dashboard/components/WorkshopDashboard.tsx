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
  technicianNotes?: string;
}

export default function WorkshopDashboard() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLiveStats = async () => {
      try {
        const res = await axios.get("http://localhost:8080/api/bookings", {
          headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` }
        });
        setBookings(res.data);
      } catch (error) {
        console.error("Failed to fetch workshop stats");
      } finally {
        setLoading(false);
      }
    };
    fetchLiveStats();
  }, []);

  if (loading) return <div className="animate-pulse h-64 bg-slate-100 rounded-3xl"></div>;

  const activeBays = bookings.filter(b => b.status === "IN_PROGRESS").length;
  const pendingJobs = bookings.filter(b => b.status === "PENDING").length;
  const recentCompleted = bookings.filter(b => b.status === "COMPLETED").slice(0, 3); // Top 3 recent

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex justify-between items-center bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Workshop Operations</h2>
          <p className="text-slate-500 font-medium mt-1">Welcome, {user?.sub}. Here is the live service floor status.</p>
        </div>
        <Link href="/bookings" className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition-all">
          Manage Job Cards
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Active Service Bays</h3>
          <div className="text-4xl font-black text-blue-600 mb-2">{activeBays} <span className="text-lg text-slate-400">Occupied</span></div>
          <p className="text-xs font-bold text-blue-600 bg-blue-50 inline-block px-2 py-1 rounded-md">Live Floor Data</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Pending Bookings</h3>
          <div className="text-4xl font-black text-amber-500 mb-2">{pendingJobs} <span className="text-lg text-slate-400">Vehicles</span></div>
          <p className="text-xs font-bold text-amber-700 bg-amber-50 inline-block px-2 py-1 rounded-md">Awaiting Bay Assignment</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Daily Completion</h3>
          <div className="text-4xl font-black text-emerald-500 mb-2">{bookings.filter(b => b.status === "COMPLETED").length} <span className="text-lg text-slate-400">Jobs</span></div>
          <p className="text-xs font-bold text-emerald-700 bg-emerald-50 inline-block px-2 py-1 rounded-md">Ready for Finance Settle</p>
        </div>
      </div>

      <div className="bg-slate-900 rounded-[2rem] p-8 shadow-xl">
        <h3 className="text-white font-black text-lg mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          Recent Diagnostic Reports
        </h3>
        <div className="space-y-3">
          {recentCompleted.length === 0 ? (
            <p className="text-slate-400 text-sm font-medium">No completed jobs yet.</p>
          ) : (
            recentCompleted.map(job => (
              <div key={job.bookingID} className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-black text-white">{job.vehicleRegNo} • {job.servicePackage}</span>
                  <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-md">COMPLETED</span>
                </div>
                <p className="text-xs font-medium text-slate-400 border-l-2 border-slate-600 pl-3 py-1">
                  {job.technicianNotes || "No diagnostic notes provided by technician."}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}