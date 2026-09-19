"use client";

import { useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../context/AuthContext";

// 1. Define the Zod Schema for bulletproof validation
const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(4, "Password cannot be empty"),
});

type LoginFormInputs = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [serverError, setServerError] = useState("");
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormInputs) => {
    setServerError("");
    try {
      const response = await axios.post("http://localhost:8080/api/auth/login", {
        username: data.username,
        password: data.password,
      });

      // Save data to context and cookies
      login({
        token: response.data.token,
        username: response.data.username,
        role: response.data.role,
        fullName: response.data.fullName,
      });

      // --- FIXED: Hard redirect straight to the smart Home page ---
      window.location.href = "/";

    } catch (err: any) {
      if (err.response?.status === 401) {
        setServerError("Invalid username or password. Please try again.");
      } else {
        setServerError("Network error. Is the Spring Boot server running?");
      }
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full bg-slate-50">

      {/* ========================================== */}
      {/* LEFT PANEL: BRANDING & ANIMATED GRAPHICS   */}
      {/* ========================================== */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 overflow-hidden items-center justify-center p-12">
        <div className="absolute top-[-20%] left-[-10%] w-[120%] h-[120%] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-blue-900/40 via-slate-900 to-slate-900 animate-slow-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px]"></div>

        <div className="relative z-10 w-full max-w-lg">
          <div className="animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <h1 className="text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight mb-6">
              Streamline your <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
                workshop operations.
              </span>
            </h1>
            <p className="text-slate-400 text-lg font-medium mb-10">
              The all-in-one enterprise command center for Lanka Auto Care. Manage bookings, inventory, and payroll in real-time.
            </p>
          </div>

          <div className="relative h-64 animate-float">
            <div className="absolute top-0 left-0 w-72 bg-white/10 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-2xl">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-xl">⚙️</span>
                </div>
                <div>
                  <div className="h-3 w-24 bg-white/20 rounded-full mb-2"></div>
                  <div className="h-2 w-16 bg-white/10 rounded-full"></div>
                </div>
              </div>
              <div className="h-2 w-full bg-white/10 rounded-full mb-2"></div>
              <div className="h-2 w-4/5 bg-white/10 rounded-full"></div>
            </div>

            <div className="absolute top-24 right-0 w-64 bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-2xl animate-float-delayed">
               <div className="flex items-center gap-3 mb-3">
                 <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                 <span className="text-xs font-bold text-white tracking-widest uppercase">Live Workshop</span>
               </div>
               <div className="text-3xl font-black text-white mb-1">12 Jobs</div>
               <div className="text-xs font-medium text-slate-400">Currently in progress</div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* RIGHT PANEL: LOGIN FORM                    */}
      {/* ========================================== */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden">

        <div className="absolute top-0 right-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-100/50 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-100/50 rounded-full blur-3xl"></div>
        </div>

        <div className="relative w-full max-w-md z-10">

          <div className="text-center mb-10 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <h2 className="text-3xl font-black tracking-tight text-slate-900 pb-1">
              Welcome Back
            </h2>
            <p className="mt-2 text-sm text-slate-500 font-medium">
              Enter your credentials to access the portal
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>

            <div className="animate-slide-up" style={{ animationDelay: "0.2s", opacity: 0, animationFillMode: "forwards" }}>
              <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">
                Username
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  {...register("username")}
                  type="text"
                  className={`w-full pl-11 pr-4 py-3.5 rounded-xl border bg-white shadow-sm focus:bg-white outline-none transition-all duration-300 ${
                    errors.username ? "border-red-400 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  }`}
                  placeholder="Enter your username"
                />
              </div>
              {errors.username && (
                <p className="mt-1.5 ml-1 text-xs font-bold text-red-500">{errors.username.message}</p>
              )}
            </div>

            <div className="animate-slide-up" style={{ animationDelay: "0.3s", opacity: 0, animationFillMode: "forwards" }}>
              <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">
                Password
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  {...register("password")}
                  type="password"
                  className={`w-full pl-11 pr-4 py-3.5 rounded-xl border bg-white shadow-sm focus:bg-white outline-none transition-all duration-300 ${
                    errors.password ? "border-red-400 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  }`}
                  placeholder="••••••••"
                />
              </div>
              {errors.password && (
                <p className="mt-1.5 ml-1 text-xs font-bold text-red-500">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl flex items-center gap-3 animate-slide-up" style={{ animationDelay: "0.4s", opacity: 0, animationFillMode: "forwards" }}>
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm font-bold text-red-700">{serverError}</p>
              </div>
            )}

            <div className="pt-2 animate-slide-up" style={{ animationDelay: "0.5s", opacity: 0, animationFillMode: "forwards" }}>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full relative flex items-center justify-center bg-slate-900 hover:bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-slate-900/20 transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-70 overflow-hidden group"
              >
                {isSubmitting ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : null}
                {isSubmitting ? "Authenticating..." : "Secure Login"}
              </button>
            </div>
          </form>

          <div className="mt-8 text-center text-sm font-medium text-slate-500 animate-slide-up" style={{ animationDelay: "0.6s", opacity: 0, animationFillMode: "forwards" }}>
            Don't have an account?{" "}
            <Link href="/register" className="font-bold text-slate-900 hover:text-blue-600 transition-colors">
              Register here
            </Link>
          </div>

        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideUpFade {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes floating {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
          100% { transform: translateY(0px); }
        }
        @keyframes slowPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; transform: scale(1.02); }
        }
        .animate-slide-up {
          animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-float {
          animation: floating 6s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: floating 6s ease-in-out 3s infinite;
        }
        .animate-slow-pulse {
          animation: slowPulse 8s ease-in-out infinite;
        }
      `}} />
    </div>
  );
}