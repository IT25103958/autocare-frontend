"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// Zod schema matching the Spring Boot entity requirements
const bookingSchema = z.object({
  vehicleRegNo: z.string().min(2, "Vehicle Registration is required."),
  servicePackage: z.string().min(1, "Please select a service package."),
  preferredDate: z.string().min(1, "Please select a preferred date and time."),
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
      // POST the new booking to the backend
      await axios.post("http://localhost:8080/api/bookings", data, getAuthHeader());

      setServerMessage({ type: "success", text: "Appointment confirmed! Redirecting to your garage..." });

      // Send the customer back to their dashboard after 2 seconds
      setTimeout(() => {
        router.push("/customers/dashboard");
      }, 2000);

    } catch (err) {
      console.error("Booking failed", err);
      setServerMessage({ type: "error", text: "Failed to schedule appointment. Please try again." });
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 py-12 px-6">
      <div className="max-w-2xl mx-auto">

        {/* Navigation Breadcrumb */}
        <div className="mb-8 animate-fade-in-up">
          <Link href="/customers/dashboard" className="text-sm font-bold text-slate-500 hover:text-blue-600 flex items-center gap-2 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Garage
          </Link>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-8 text-white">
            <h1 className="text-3xl font-black tracking-tight mb-2">Schedule Service</h1>
            <p className="text-slate-400 font-medium">Select your vehicle and preferred time slot.</p>
          </div>

          {/* Booking Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-6">

            {serverMessage.text && (
              <div className={`p-4 rounded-xl text-sm font-bold animate-fade-in-up flex items-center gap-3 ${serverMessage.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {serverMessage.text}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Vehicle Registration No.</label>
              <input
                {...register("vehicleRegNo")}
                type="text"
                placeholder="e.g., CBA-1234"
                className={`w-full px-4 py-3 rounded-xl border focus:ring-4 outline-none transition-all bg-slate-50 focus:bg-white font-medium ${errors.vehicleRegNo ? 'border-red-500 focus:border-red-500 focus:ring-red-500/10' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10'}`}
              />
              {errors.vehicleRegNo && <p className="mt-1 text-xs font-bold text-red-500">{errors.vehicleRegNo.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Service Package</label>
              <select
                {...register("servicePackage")}
                className={`w-full px-4 py-3 rounded-xl border focus:ring-4 outline-none transition-all bg-slate-50 focus:bg-white font-medium cursor-pointer ${errors.servicePackage ? 'border-red-500 focus:border-red-500 focus:ring-red-500/10' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10'}`}
              >
                <option value="Basic Mileage Service">Basic Mileage Service</option>
                <option value="Full Hybrid System Service">Full Hybrid System Service</option>
                <option value="Premium Wash & Polish">Premium Wash & Polish</option>
                <option value="General Repair / Inspection">General Repair / Inspection</option>
              </select>
              {errors.servicePackage && <p className="mt-1 text-xs font-bold text-red-500">{errors.servicePackage.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Preferred Date & Time</label>
              <input
                {...register("preferredDate")}
                type="datetime-local"
                className={`w-full px-4 py-3 rounded-xl border focus:ring-4 outline-none transition-all bg-slate-50 focus:bg-white font-medium text-slate-700 ${errors.preferredDate ? 'border-red-500 focus:border-red-500 focus:ring-red-500/10' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10'}`}
              />
              {errors.preferredDate && <p className="mt-1 text-xs font-bold text-red-500">{errors.preferredDate.message}</p>}
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={isSubmitting || serverMessage.type === "success"}
                className="w-full flex items-center justify-center py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Confirming Appointment..." : "Confirm Booking"}
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