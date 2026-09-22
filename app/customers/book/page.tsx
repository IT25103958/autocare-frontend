"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// ENTERPRISE UPGRADE: Strict Sri Lankan Vehicle Registration Validation
const bookingSchema = z.object({
  vehicleRegNo: z.string()
    .min(4, "Registration too short.")
    // REGEX FIX: Supports WP-CBA-1234, WP-CA-1234, CBA-1234, and 301-1234
    .regex(/^([A-Z]{2}-)?([A-Z]{2,3}|[0-9]{1,4})-[0-9]{4}$/, "Invalid format (e.g., WP-CBA-1234, WP-CA-1234, 301-1234)"),
  servicePackage: z.string().min(1, "Please select a service package."),
  preferredDate: z.string().refine((dateString) => {
    const selectedDate = new Date(dateString);
    const now = new Date();
    return selectedDate > now; // SECURITY: Prevents booking in the past
  }, { message: "Please select a future date and time." }),
});

type BookingFormInputs = z.infer<typeof bookingSchema>;

export default function BookServicePage() {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormInputs>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      servicePackage: "Basic Mileage Service"
    }
  });

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` }
  });

const onSubmit = async (data: BookingFormInputs) => {
    setServerMessage({ type: "", text: "" });
    try {
      await axios.post("http://localhost:8080/api/bookings", data, getAuthHeader());

      setServerMessage({ type: "success", text: "Appointment confirmed! Redirecting to your garage..." });

      setTimeout(() => {
        router.push("/customers/dashboard");
      }, 2000);

    } catch (err: any) {
      console.error("Booking failed", err);

      // FIX: Safely parse the Spring Boot error response to prevent React crashes
      let errorMsg = "Failed to schedule appointment. Please try again.";
      if (err.response?.data) {
        if (typeof err.response.data === "string") {
          errorMsg = err.response.data; // Handles custom plain-text error messages
        } else if (err.response.data.message) {
          errorMsg = err.response.data.message; // Extracts the string from Spring's default JSON error object
        }
      }

      setServerMessage({ type: "error", text: errorMsg });
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 py-12 px-6">
      <div className="max-w-2xl mx-auto">

        {/* Navigation Breadcrumb */}
        <div className="mb-8 animate-fade-in-up">
          <Link href="/customers/dashboard" className="text-sm font-bold text-slate-500 hover:text-blue-600 flex items-center gap-2 transition-colors w-max">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Garage
          </Link>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {/* Header */}
          <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
            <div className="relative z-10">
              <h1 className="text-3xl font-black tracking-tight mb-2">Schedule Service</h1>
              <p className="text-slate-400 font-medium">Select your vehicle and preferred time slot for the workshop.</p>
            </div>
            {/* Decorative background element */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
          </div>

          {/* Booking Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-6">

            {serverMessage.text && (
              <div className={`p-4 rounded-xl text-sm font-bold animate-fade-in-up flex items-center gap-3 ${serverMessage.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {serverMessage.text}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Vehicle Registration No.</label>
              <input
                {...register("vehicleRegNo", {
                  // FIX: Automatically transform input to uppercase as the user types
                  onChange: (e) => { e.target.value = e.target.value.toUpperCase(); }
                })}
                type="text"
                placeholder="e.g., WP-CBA-1234"
                className={`w-full px-4 py-3.5 rounded-xl border outline-none transition-all bg-slate-50 focus:bg-white font-bold text-slate-800 uppercase ${errors.vehicleRegNo ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' : 'border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'}`}
              />
              {errors.vehicleRegNo && <p className="mt-2 text-xs font-bold text-red-500 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {errors.vehicleRegNo.message}
              </p>}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Service Package</label>
              <select
                {...register("servicePackage")}
                className={`w-full px-4 py-3.5 rounded-xl border outline-none transition-all bg-slate-50 focus:bg-white font-bold text-slate-800 cursor-pointer ${errors.servicePackage ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' : 'border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'}`}
              >
                <option value="Basic Mileage Service">Basic Mileage Service</option>
                <option value="Full Engine Diagnostic & Tuning">Full Engine Diagnostic & Tuning</option>
                <option value="Synthetic Oil & Filter Replacement">Synthetic Oil & Filter Replacement</option>
                <option value="Brake Pad & Rotor Servicing">Brake Pad & Rotor Servicing</option>
                <option value="Hybrid Battery Health Check">Hybrid Battery Health Check</option>
              </select>
              {errors.servicePackage && <p className="mt-2 text-xs font-bold text-red-500">{errors.servicePackage.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Preferred Date & Time</label>
              <input
                {...register("preferredDate")}
                type="datetime-local"
                className={`w-full px-4 py-3.5 rounded-xl border outline-none transition-all bg-slate-50 focus:bg-white font-bold text-slate-800 cursor-pointer ${errors.preferredDate ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' : 'border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'}`}
              />
              {errors.preferredDate && <p className="mt-2 text-xs font-bold text-red-500 flex items-center gap-1">
                 <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {errors.preferredDate.message}
              </p>}
            </div>

            <div className="pt-6 border-t border-slate-100">
              <button
                type="submit"
                disabled={isSubmitting || serverMessage.type === "success"}
                className="w-full flex items-center justify-center py-4 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Confirming..." : "Confirm Booking Request"}
              </button>
            </div>

          </form>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
      `}} />
    </div>
  );
}