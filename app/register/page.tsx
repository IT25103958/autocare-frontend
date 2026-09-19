"use client";

import { useState } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";

// --- 1. ZOD SCHEMA (With Email Validation) ---
const registerSchema = z.object({
  fullName: z.string().min(2, "Full name is required."),
  email: z.string().email("Please enter a valid email address."),
  username: z.string().min(3, "Username must be at least 3 characters."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

type RegisterFormInputs = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInputs>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormInputs) => {
    setServerMessage({ type: "", text: "" });

    try {
      const payload = {
        fullName: data.fullName,
        email: data.email,
        username: data.username,
        password: data.password,
        role: "CUSTOMER"
      };

      await axios.post("http://localhost:8080/api/auth/register", payload);

      setServerMessage({ type: "success", text: "Account created successfully! Redirecting..." });

      setTimeout(() => {
        router.push("/login");
      }, 2000);

    } catch (err: any) {
      console.error("Registration Error:", err.response || err);

      // --- UPGRADED DYNAMIC ERROR HANDLING ---
      // Try to extract the exact error message sent by Spring Boot
      const backendError = err.response?.data?.message || err.response?.data;

      if (typeof backendError === "string" && backendError.length < 100) {
        // If Spring Boot gave us a clean string error (e.g. "Email already in use")
        setServerMessage({ type: "error", text: backendError });
      } else if (err.response?.status === 400) {
        // Fallback for generic 400 errors
        setServerMessage({ type: "error", text: "Registration failed. This email or username is already taken." });
      } else {
        // Fallback for server crashes/network issues
        setServerMessage({ type: "error", text: "Network error. Is the Spring Boot server running?" });
      }
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full bg-white">

      {/* ========================================== */}
      {/* LEFT PANEL: REGISTRATION FORM              */}
      {/* ========================================== */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden">

        {/* Subtle background decoration */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-50/50 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative w-full max-w-md z-10">

          <div className="mb-8 animate-fade-in-right" style={{ animationDelay: "0.1s" }}>
            <h2 className="text-4xl font-black tracking-tight text-slate-900 pb-2">
              Join <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">Lanka Auto</span>
            </h2>
            <p className="mt-1 text-slate-500 font-medium">
              Create your free account to manage your vehicle's service history and bookings.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>

            {/* Full Name */}
            <div className="animate-fade-in-right" style={{ animationDelay: "0.15s", opacity: 0, animationFillMode: "forwards" }}>
              <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">Full Name</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  {...register("fullName")}
                  type="text"
                  placeholder="e.g., Nimal Perera"
                  className={`w-full pl-11 pr-4 py-3 rounded-xl border bg-slate-50 focus:bg-white shadow-sm outline-none transition-all duration-300 ${
                    errors.fullName ? "border-red-400 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  }`}
                />
              </div>
              {errors.fullName && <p className="mt-1 text-xs font-bold text-red-500 ml-1">{errors.fullName.message}</p>}
            </div>

            {/* Email Address */}
            <div className="animate-fade-in-right" style={{ animationDelay: "0.2s", opacity: 0, animationFillMode: "forwards" }}>
              <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">Email Address</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  {...register("email")}
                  type="email"
                  placeholder="name@example.com"
                  className={`w-full pl-11 pr-4 py-3 rounded-xl border bg-slate-50 focus:bg-white shadow-sm outline-none transition-all duration-300 ${
                    errors.email ? "border-red-400 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  }`}
                />
              </div>
              {errors.email && <p className="mt-1 text-xs font-bold text-red-500 ml-1">{errors.email.message}</p>}
            </div>

            {/* Username */}
            <div className="animate-fade-in-right" style={{ animationDelay: "0.25s", opacity: 0, animationFillMode: "forwards" }}>
              <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">Username</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <input
                  {...register("username")}
                  type="text"
                  placeholder="Choose a username"
                  className={`w-full pl-11 pr-4 py-3 rounded-xl border bg-slate-50 focus:bg-white shadow-sm outline-none transition-all duration-300 ${
                    errors.username ? "border-red-400 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  }`}
                />
              </div>
              {errors.username && <p className="mt-1 text-xs font-bold text-red-500 ml-1">{errors.username.message}</p>}
            </div>

            {/* Passwords Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in-right" style={{ animationDelay: "0.3s", opacity: 0, animationFillMode: "forwards" }}>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    {...register("password")}
                    type="password"
                    placeholder="••••••••"
                    className={`w-full pl-11 pr-4 py-3 rounded-xl border bg-slate-50 focus:bg-white shadow-sm outline-none transition-all duration-300 ${
                      errors.password ? "border-red-400 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    }`}
                  />
                </div>
                {errors.password && <p className="mt-1 text-xs font-bold text-red-500 ml-1">{errors.password.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">Confirm Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <input
                    {...register("confirmPassword")}
                    type="password"
                    placeholder="••••••••"
                    className={`w-full pl-11 pr-4 py-3 rounded-xl border bg-slate-50 focus:bg-white shadow-sm outline-none transition-all duration-300 ${
                      errors.confirmPassword ? "border-red-400 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    }`}
                  />
                </div>
                {errors.confirmPassword && <p className="mt-1 text-xs font-bold text-red-500 ml-1">{errors.confirmPassword.message}</p>}
              </div>
            </div>

            {serverMessage.text && (
              <div className={`p-4 rounded-xl flex items-center gap-3 animate-fade-in-right ${serverMessage.type === "success" ? "bg-green-50 text-green-700 border-l-4 border-green-500" : "bg-red-50 text-red-700 border-l-4 border-red-500"}`} style={{ animationDelay: "0.4s", opacity: 0, animationFillMode: "forwards" }}>
                <p className="text-sm font-bold">{serverMessage.text}</p>
              </div>
            )}

            <div className="pt-2 animate-fade-in-right" style={{ animationDelay: "0.4s", opacity: 0, animationFillMode: "forwards" }}>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full relative flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-600/30 transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-70 overflow-hidden group"
              >
                {isSubmitting ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : null}
                {isSubmitting ? "Setting up garage..." : "Create Account"}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm font-medium text-slate-500 animate-fade-in-right" style={{ animationDelay: "0.5s", opacity: 0, animationFillMode: "forwards" }}>
            Already part of the family?{" "}
            <Link href="/login" className="font-bold text-blue-600 hover:text-blue-700 transition-colors">
              Sign In here
            </Link>
          </div>

        </div>
      </div>

      {/* ========================================== */}
      {/* RIGHT PANEL: CUSTOMER BENEFITS GRAPHICS    */}
      {/* ========================================== */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-blue-600 to-indigo-900 overflow-hidden items-center justify-center p-12">
        {/* Soft lighting effects */}
        <div className="absolute top-0 right-0 w-[150%] h-[150%] bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-cyan-400/20 via-transparent to-transparent"></div>

        <div className="relative z-10 w-full max-w-lg">
          <div className="animate-fade-in-left" style={{ animationDelay: "0.2s" }}>
            <h1 className="text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight mb-6">
              Your personal <br />
              <span className="text-cyan-300">digital garage.</span>
            </h1>
            <p className="text-blue-100 text-lg font-medium mb-12">
              Book services, track maintenance history, and get real-time updates on your vehicle directly from your phone or computer.
            </p>
          </div>

          {/* Decorative Floating Customer UI Elements */}
          <div className="relative h-64 animate-float-slow">

            {/* Feature Card 1: Booking */}
            <div className="absolute top-0 right-10 w-72 bg-white/10 backdrop-blur-md border border-white/20 p-5 rounded-2xl shadow-2xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-cyan-400/20 flex items-center justify-center text-cyan-300">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-white font-bold text-sm">Instant Booking</div>
                  <div className="text-cyan-200 text-xs mt-0.5">Skip the waiting line</div>
                </div>
              </div>
            </div>

            {/* Feature Card 2: Vehicle Status */}
            <div className="absolute top-24 left-0 w-80 bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-2xl animate-float-delayed">
               <div className="flex items-center justify-between mb-3">
                 <span className="text-xs font-bold text-white tracking-widest uppercase">Toyota Prius (CBA-1234)</span>
                 <span className="px-2 py-1 bg-green-500/20 text-green-300 text-[10px] font-bold rounded-full">IN BAY</span>
               </div>
               <div className="w-full bg-white/10 rounded-full h-2 mb-2">
                 <div className="bg-gradient-to-r from-cyan-400 to-blue-500 h-2 rounded-full w-[65%]"></div>
               </div>
               <div className="text-xs font-medium text-blue-200 text-right">65% Completed</div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* INLINE CSS FOR GUARANTEED ANIMATIONS       */}
      {/* ========================================== */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInRight {
          0% { opacity: 0; transform: translateX(-20px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeInLeft {
          0% { opacity: 0; transform: translateX(20px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes floatSlow {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        .animate-fade-in-right {
          animation: fadeInRight 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in-left {
          animation: fadeInLeft 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-float-slow {
          animation: floatSlow 7s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: floatSlow 7s ease-in-out 3.5s infinite;
        }
      `}} />
    </div>
  );
}