"use client";

import { useAuth } from "../../context/AuthContext";
import Link from "next/link";

export default function CustomerDashboard() {
  const { user } = useAuth();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12">
      <div className="max-w-7xl mx-auto">

        {/* --- WELCOME HEADER --- */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="animate-fade-in-up">
            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">
              Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">{user?.username}</span>
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

          {/* MAIN COLUMN (Vehicles & Active Jobs) */}
          <div className="lg:col-span-2 space-y-8">

            {/* Active Service Status */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Active Service</h2>
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold uppercase tracking-wider rounded-full">In Progress</span>
              </div>

              <div className="flex items-center gap-6 p-6 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-3xl">
                  🚗
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900">Toyota Prius (CBA-1234)</h3>
                  <p className="text-slate-500 text-sm font-medium mt-1">Full Hybrid System Service</p>
                </div>
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-bold text-slate-900">Bay 02</div>
                  <div className="text-xs font-medium text-slate-400 mt-1">Est. Completion: 2:30 PM</div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-8">
                <div className="flex justify-between text-xs font-bold text-slate-500 mb-2 px-1">
                  <span>Checked In</span>
                  <span className="text-blue-600">Servicing</span>
                  <span>Washing</span>
                  <span>Ready</span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 w-1/2 rounded-full relative">
                    <div className="absolute top-0 right-0 bottom-0 left-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.2)_25%,rgba(255,255,255,.2)_50%,transparent_50%,transparent_75%,rgba(255,255,255,.2)_75%,rgba(255,255,255,.2)_100%)] bg-[length:1rem_1rem] animate-[progress_1s_linear_infinite]"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* My Garage / Vehicles */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">My Garage</h2>
                <button className="text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors">
                  + Add Vehicle
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Vehicle Card */}
                <div className="p-5 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      🚙
                    </div>
                    <span className="text-xs font-bold text-slate-400">CBA-1234</span>
                  </div>
                  <h3 className="text-slate-900 font-bold">Toyota Prius</h3>
                  <p className="text-slate-500 text-xs mt-1">Last serviced: 2 months ago</p>
                </div>
              </div>
            </div>

          </div>

          {/* SIDEBAR (Loyalty & History) */}
          <div className="space-y-8">

            {/* Loyalty Points Widget */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-3xl shadow-lg relative overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl"></div>
              <h2 className="text-white font-bold tracking-tight mb-2 relative z-10">Lanka Auto Rewards</h2>
              <div className="flex items-baseline gap-2 relative z-10 mb-6">
                <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500">1,250</span>
                <span className="text-sm font-bold text-slate-400">Pts</span>
              </div>
              <button className="w-full py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-bold rounded-xl transition-colors relative z-10">
                Redeem for Service
              </button>
            </div>

            {/* Service History */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-6">Recent History</h2>
              <div className="space-y-6">

                {/* History Item */}
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                    🔧
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Standard Mileage Service</h3>
                    <p className="text-xs text-slate-500 mt-1">Toyota Prius • Aug 12, 2026</p>
                    <a href="#" className="text-xs font-bold text-blue-600 hover:underline mt-2 inline-block">View Invoice PDF</a>
                  </div>
                </div>

                {/* History Item */}
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                    💧
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Premium Wash & Polish</h3>
                    <p className="text-xs text-slate-500 mt-1">Toyota Prius • Jun 05, 2026</p>
                  </div>
                </div>

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