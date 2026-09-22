"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../../context/AuthContext";
import Link from "next/link";

interface ServiceBooking {
  bookingID: number;
  vehicleRegNo: string;
  vehicleModel?: string;
  servicePackage: string;
  status: string;
  preferredDate: string;
  totalPartsCost?: number;
  laborCharge?: number;
}

interface CustomerProfile {
  id: number;
  name: string;
  email: string;
  loyaltyPoints?: number;
}

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  useEffect(() => {
    setIsMounted(true);
    if (!user) return;

    const fetchCustomerData = async () => {
      try {
        const [bookingsRes, profileRes] = await Promise.all([
          axios.get("http://localhost:8080/api/bookings/my-bookings", getAuthHeader()).catch(() => ({ data: [] })),
          axios.get("http://localhost:8080/api/customers/my-profile", getAuthHeader()).catch(() => ({ data: null }))
        ]);

        // Sort newest first
        setBookings(bookingsRes.data.sort((a: ServiceBooking, b: ServiceBooking) => b.bookingID - a.bookingID));
        setProfile(profileRes.data);
      } catch (error) {
        console.error("Failed to load customer data", error);
      }
    };

    fetchCustomerData();
  }, [user]);

  // --- DYNAMIC DATA COMPUTATIONS ---

  // 1. Identify if a car is currently in the workshop
  const activeBooking = bookings.find(b =>
    b.status !== "COMPLETED" && b.status !== "PAID" && b.status !== "CANCELLED"
  );

  // 2. Map service history
  const history = bookings.filter(b => b.status === "COMPLETED" || b.status === "PAID");

  // 3. Extract unique vehicles for the "My Garage" section based on past bookings
  const garageMap = new Map();
  bookings.forEach(b => {
    if (!garageMap.has(b.vehicleRegNo)) {
      garageMap.set(b.vehicleRegNo, {
        regNo: b.vehicleRegNo,
        model: b.vehicleModel || "Registered Vehicle",
        lastService: b.preferredDate
      });
    }
  });
  const myGarage = Array.from(garageMap.values());

  // 4. Calculate Dynamic Progress Bar
  let progressWidth = "0%";
  let progressStage = 0;
  if (activeBooking) {
    if (activeBooking.status === "PENDING") { progressWidth = "25%"; progressStage = 1; }
    else if (activeBooking.status === "IN_PROGRESS") { progressWidth = "50%"; progressStage = 2; }
    else if (activeBooking.status === "WASHING") { progressWidth = "75%"; progressStage = 3; }
    else if (activeBooking.status === "READY") { progressWidth = "100%"; progressStage = 4; }
  }

  if (!isMounted) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12">
      <div className="max-w-7xl mx-auto">

        {/* --- WELCOME HEADER --- */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="animate-fade-in-up">
            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">
              Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">{profile?.name || user?.username}</span>
            </h1>
            <p className="text-slate-500 font-medium mt-2">
              Manage your vehicles, track service history, and book new appointments.
            </p>
          </div>
          <Link href="/customers/book" className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all duration-300 hover:-translate-y-0.5 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Book New Service
          </Link>
        </div>

        {/* --- DASHBOARD GRID --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* MAIN COLUMN */}
          <div className="lg:col-span-2 space-y-8">

            {/* --- ACTIVE SERVICE TRACKER --- */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Active Service</h2>
                {activeBooking && (
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-md border border-blue-100">
                    Live Tracking
                  </span>
                )}
              </div>

              {activeBooking ? (
                <>
                  <div className="flex items-center gap-6 p-6 rounded-2xl bg-slate-50 border border-slate-100 relative overflow-hidden">
                    {/* Animated background glow for active jobs */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/10 rounded-full blur-3xl animate-pulse"></div>

                    <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-3xl z-10 shrink-0">
                      🚗
                    </div>
                    <div className="flex-1 z-10">
                      <h3 className="text-lg font-bold text-slate-900 uppercase tracking-wide">{activeBooking.vehicleRegNo}</h3>
                      <p className="text-slate-500 text-sm font-medium mt-1">{activeBooking.servicePackage}</p>
                    </div>
                    <div className="text-right hidden sm:block z-10">
                      <div className="text-xs font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-md inline-block mb-1 border border-blue-100">
                        {activeBooking.status.replace('_', ' ')}
                      </div>
                      <div className="text-xs font-bold text-slate-400 mt-1">Ref: JOB-{activeBooking.bookingID}</div>
                    </div>
                  </div>

                  {/* DYNAMIC PROGRESS BAR */}
                  <div className="mt-8">
                    <div className="flex justify-between text-xs font-black text-slate-400 uppercase tracking-wider mb-2 px-1">
                      <span className={progressStage >= 1 ? "text-blue-600" : ""}>Checked In</span>
                      <span className={progressStage >= 2 ? "text-blue-600" : ""}>Servicing</span>
                      <span className={progressStage >= 3 ? "text-blue-600" : ""}>Washing</span>
                      <span className={progressStage >= 4 ? "text-emerald-600" : ""}>Ready</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full relative transition-all duration-1000 ease-out"
                        style={{ width: progressWidth }}
                      >
                        <div className="absolute top-0 right-0 bottom-0 left-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.2)_25%,rgba(255,255,255,.2)_50%,transparent_50%,transparent_75%,rgba(255,255,255,.2)_75%,rgba(255,255,255,.2)_100%)] bg-[length:1rem_1rem] animate-[progress_1s_linear_infinite]"></div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                  <div className="text-4xl mb-3 opacity-50">🏖️</div>
                  <h3 className="text-sm font-bold text-slate-900">No Vehicles in the Workshop</h3>
                  <p className="text-xs text-slate-500 mt-1">Your vehicles are currently not checked in for any active service.</p>
                </div>
              )}
            </div>

            {/* --- MY GARAGE --- */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">My Garage</h2>
                <Link href="/customers/book" className="text-xs font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 transition-colors">
                  + Add Vehicle
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {myGarage.map((car, idx) => (
                  <div key={idx} className="p-5 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                        🚙
                      </div>
                      <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded uppercase tracking-wider">{car.regNo}</span>
                    </div>
                    <h3 className="text-slate-900 font-bold">{car.model}</h3>
                    <p className="text-slate-500 text-xs mt-1 font-medium">Last seen: {new Date(car.lastService).toLocaleDateString()}</p>
                  </div>
                ))}
                {myGarage.length === 0 && (
                  <div className="col-span-full p-6 text-center text-slate-400 text-sm font-medium border border-dashed rounded-2xl">
                    You haven't serviced any vehicles with us yet.
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* SIDEBAR (Loyalty & History) */}
          <div className="space-y-8">

            {/* --- LOYALTY POINTS WIDGET --- */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-3xl shadow-lg relative overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl"></div>
              <h2 className="text-white font-bold tracking-tight mb-2 relative z-10">Lanka Auto Rewards</h2>
              <div className="flex items-baseline gap-2 relative z-10 mb-6">
                <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500">
                  {profile?.loyaltyPoints || 0}
                </span>
                <span className="text-sm font-bold text-slate-400">Pts</span>
              </div>
              <button className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs uppercase tracking-widest font-black rounded-xl transition-colors relative z-10">
                Redeem for Service
              </button>
            </div>

            {/* --- SERVICE HISTORY --- */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-6">Recent History</h2>
              <div className="space-y-6">

                {history.slice(0, 4).map((job) => (
                  <div key={job.bookingID} className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-lg">
                      {job.servicePackage.toLowerCase().includes('wash') ? '💧' : '🔧'}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{job.servicePackage}</h3>
                      <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">{job.vehicleRegNo} • {new Date(job.preferredDate).toLocaleDateString()}</p>
                      {job.status === "PAID" && (
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded mt-2 inline-block">
                          Invoice Settled
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {history.length === 0 && (
                  <div className="text-center text-sm font-medium text-slate-400 py-4">
                    No completed services yet.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes progress {
          from { background-position: 1rem 0; }
          to { background-position: 0 0; }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
      `}} />
    </div>
  );
}