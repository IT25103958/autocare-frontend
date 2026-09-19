"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./context/AuthContext";

export default function LandingPage() {
  const [isVisible, setIsVisible] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">

      {/* --- CINEMATIC HERO SECTION --- */}
      <section className="relative bg-[#0B1121] text-white overflow-hidden flex flex-col justify-center min-h-[75vh] pt-10">

        {/* Animated Background Gradients */}
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[80%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-600/20 via-transparent to-transparent opacity-70 animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[60%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent"></div>

        <div className={`max-w-7xl mx-auto px-6 lg:px-8 w-full relative z-10 transition-all duration-1000 transform ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-900/30 border border-blue-500/20 text-blue-300 font-semibold text-xs uppercase tracking-widest mb-8 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
            Enterprise Auto Management
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black mb-6 tracking-tighter leading-[1.05]">
            Premium Auto Care, <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
              Simplified.
            </span>
          </h1>

          <p className="text-lg md:text-2xl text-slate-400 mb-10 max-w-2xl font-medium leading-relaxed">
            Your one-stop command center for intelligent vehicle servicing, genuine spare parts tracking, and automated fuel management.
          </p>

          {/* --- SMART DYNAMIC BUTTONS --- */}
          <div className="flex flex-col sm:flex-row gap-4 mb-16">
            {!user ? (
              // GUEST VIEW
              <>
                <Link href="/register" className="relative group inline-flex items-center justify-center px-8 py-4 text-base font-bold text-white transition-all duration-300 bg-blue-600 rounded-xl overflow-hidden shadow-lg shadow-blue-600/30 hover:bg-blue-500 hover:-translate-y-1">
                  <span className="relative z-10">Join as a Customer</span>
                  <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shine"></div>
                </Link>
                <Link href="/login" className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/10 transition-all duration-300 text-center backdrop-blur-sm hover:-translate-y-1">
                  Sign In to Portal
                </Link>
              </>
            ) : user.role === "CUSTOMER" ? (
              // CUSTOMER VIEW
              <Link href="/customers/dashboard" className="relative group inline-flex items-center justify-center gap-3 px-8 py-4 text-base font-bold text-white transition-all duration-300 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/30 hover:bg-blue-500 hover:-translate-y-1">
                Enter My Garage
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            ) : (
              // STAFF VIEW
              <Link href="/bookings" className="relative group inline-flex items-center justify-center gap-3 px-8 py-4 text-base font-bold text-white transition-all duration-300 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/30 hover:bg-blue-500 hover:-translate-y-1">
                Launch Operations Dashboard
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </Link>
            )}
          </div>

          {/* --- LIVE PLATFORM STATS BANNER --- */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-lg">
            <StatBlock number="24/7" label="Online Booking" />
            <StatBlock number="100%" label="Genuine Parts" />
            <StatBlock number="Real-time" label="Bay Tracking" />
            <StatBlock number="Automated" label="Fuel Management" />
          </div>

        </div>
      </section>

      {/* --- SERVICES HIGHLIGHT SECTION --- */}
      <section className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 tracking-tight">Everything Your Vehicle Needs</h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto font-medium">Built on modern enterprise architecture to deliver a seamless experience from the moment you drop off your keys.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              icon="⚙️"
              title="Expert Servicing"
              description="Book appointments instantly online. Track your vehicle's progress in real-time from our service bays directly to completion."
              delay="0.1s"
            />
            <FeatureCard
              icon="⛽"
              title="Smart Fuel Stations"
              description="Experience our digitally-managed fueling station with live stock tracking, ensuring we are always ready for your arrival."
              delay="0.2s"
            />
            <FeatureCard
              icon="📦"
              title="Genuine Inventory"
              description="Our fully integrated spare parts inventory ensures we always have exactly what your specific vehicle model requires in stock."
              delay="0.3s"
            />
          </div>

        </div>
      </section>

      {/* --- MINIMAL FOOTER --- */}
      <footer className="bg-slate-950 border-t border-slate-900 py-12 text-center text-sm font-medium text-slate-600">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center">
            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <span className="font-bold tracking-widest uppercase text-slate-400">Lanka Auto Care</span>
        </div>
        <p>&copy; 2026 Lanka Auto Care. Enterprise Operations Portal.</p>
      </footer>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shine {
          100% { transform: translateX(100%); }
        }
        @keyframes pulseSlow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        .animate-shine { animation: shine 1.5s ease-in-out infinite; }
        .animate-pulse-slow { animation: pulseSlow 8s ease-in-out infinite; }
        .mask-edges {
          mask-image: linear-gradient(to right, transparent, black 10px, black calc(100% - 10px), transparent);
        }
      `}} />
    </div>
  );
}

function StatBlock({ number, label }: { number: string, label: string }) {
  return (
    <div className="flex flex-col border-l border-white/10 first:border-l-0 pl-4 sm:pl-6 py-2">
      <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">{number}</span>
      <span className="text-xs sm:text-sm font-bold text-blue-400 mt-1 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function FeatureCard({ icon, title, description, delay }: { icon: string, title: string, description: string, delay: string }) {
  return (
    <div className="bg-white p-10 rounded-3xl border border-slate-100 hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-900/5 transition-all duration-500 transform hover:-translate-y-2 group cursor-default" style={{ animationDelay: delay }}>
      <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-3xl mb-8 transform group-hover:scale-110 group-hover:-rotate-6 group-hover:bg-blue-50 transition-all duration-300 shadow-sm border border-slate-100">
        {icon}
      </div>
      <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">{title}</h3>
      <p className="text-slate-500 leading-relaxed font-medium">{description}</p>
    </div>
  );
}