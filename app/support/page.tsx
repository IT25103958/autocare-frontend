"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const supportSchema = z.object({
  category: z.enum(["VEHICLE_SERVICE", "BILLING_FINANCE", "WEBSITE_ERROR", "GENERAL_INQUIRY"], {
    errorMap: () => ({ message: "Please select a support category." }),
  }),
  vehicleRegistration: z.string().optional(),
  issueDescription: z.string()
    .min(20, "Please provide at least 20 characters of detail so our team can assist you effectively.")
    .max(500, "Description exceeds the 500-character system limit.")
    .refine((val) => val.trim().length >= 20, "Description cannot consist of only blank spaces."),
}).refine((data) => {
  if (data.category === "VEHICLE_SERVICE") {
    return data.vehicleRegistration && data.vehicleRegistration.trim().length >= 3;
  }
  return true;
}, {
  message: "Vehicle registration is strictly required for vehicle service issues.",
  path: ["vehicleRegistration"],
});

type SupportFormInputs = z.infer<typeof supportSchema>;

interface Customer {
  customerID: number;
  name: string;
  vehicleRegNo: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  VEHICLE_SERVICE: "Vehicle / Service Problem",
  BILLING_FINANCE: "Billing & Finance",
  WEBSITE_ERROR: "Website & Tech Support",
  GENERAL_INQUIRY: "General Inquiry"
};

// Maps the frontend UI selections to the exact expected Spring Boot backend values
const BACKEND_ROUTING_MAP: Record<string, string> = {
  VEHICLE_SERVICE: "SERVICE",
  BILLING_FINANCE: "FINANCE",
  WEBSITE_ERROR: "WEB",
  GENERAL_INQUIRY: "GENERAL"
};

export default function SubmitTicketPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" }>({
    isOpen: false,
    title: "",
    message: "",
    type: "success"
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<SupportFormInputs>({
    resolver: zodResolver(supportSchema),
    mode: "onChange",
    defaultValues: {
      category: "VEHICLE_SERVICE"
    }
  });

  const descriptionText = watch("issueDescription") || "";
  const selectedCategory = watch("category");

  useEffect(() => {
    setIsMounted(true);
    const fetchCustomers = async () => {
      try {
        const res = await axios.get("http://localhost:8080/api/customers", {
           headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` }
        });
        setCustomers(res.data);
      } catch (err) {
        console.error("Failed to load customer list");
      }
    };
    fetchCustomers();
  }, []);

  const onSubmit = async (data: SupportFormInputs) => {
    let targetCustomerId = 1;

    if (data.category === "VEHICLE_SERVICE" && data.vehicleRegistration) {
      const cleanInput = data.vehicleRegistration.replace(/\s+/g, '').toUpperCase();
      const matchedCustomer = customers.find(c =>
        c.vehicleRegNo.replace(/\s+/g, '').toUpperCase() === cleanInput
      );

      if (!matchedCustomer) {
        setModal({
          isOpen: true,
          type: "error",
          title: "Profile Not Found",
          message: "Vehicle Registration not found in our records. Please verify your number or switch the category."
        });
        return;
      }
      targetCustomerId = matchedCustomer.customerID;
    } else if (customers.length > 0) {
      targetCustomerId = customers[0].customerID;
    }

    try {
      const formattedDescription = `[${CATEGORY_LABELS[data.category]}] ${data.issueDescription.trim()}`;

      // Translate the Zod category string to the Backend Routing Engine string
      const routingCategory = BACKEND_ROUTING_MAP[data.category];

      await axios.post(`http://localhost:8080/api/complaints/submit/${targetCustomerId}`,
        {
          category: routingCategory, // CRITICAL FIX: Injects into auto-router
          issueDescription: formattedDescription
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } }
      );

      setModal({
        isOpen: true,
        type: "success",
        title: "Ticket Submitted Successfully",
        message: "Your support ticket has been logged in the CRM desk. An agent will review your case shortly."
      });
      reset();
    } catch (err: any) {
      setModal({
        isOpen: true,
        type: "error",
        title: "Transmission Failed",
        message: "The server rejected the request. Please verify your network connection."
      });
    }
  };

  if (!isMounted) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 md:p-12 flex items-center justify-center relative">
      <div className="max-w-3xl w-full bg-white p-8 md:p-10 rounded-3xl shadow-lg border border-slate-200 animate-fade-in-up">

        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-sm">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">Support Desk</h1>
        </div>

        <p className="text-slate-500 font-medium mb-8 pb-6 border-b border-slate-100 pl-16">
          Submit an issue directly to the Lanka Auto Care CRM team. Standard response time is 2-4 hours.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

          {/* --- CATEGORY CARDS --- */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
              1. What do you need help with?
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              <div
                onClick={() => setValue("category", "VEHICLE_SERVICE", { shouldValidate: true })}
                className={`cursor-pointer border-2 rounded-2xl p-4 transition-all ${selectedCategory === "VEHICLE_SERVICE" ? "border-blue-600 bg-blue-50/50 shadow-sm" : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"}`}
              >
                <div className="font-bold text-slate-900 text-sm">Vehicle Service</div>
                <div className="text-xs text-slate-500 mt-1">Repairs, parts, warranty</div>
              </div>

              <div
                onClick={() => setValue("category", "BILLING_FINANCE", { shouldValidate: true })}
                className={`cursor-pointer border-2 rounded-2xl p-4 transition-all ${selectedCategory === "BILLING_FINANCE" ? "border-blue-600 bg-blue-50/50 shadow-sm" : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"}`}
              >
                <div className="font-bold text-slate-900 text-sm">Billing & Finance</div>
                <div className="text-xs text-slate-500 mt-1">Invoices, payments, refunds</div>
              </div>

              <div
                onClick={() => setValue("category", "WEBSITE_ERROR", { shouldValidate: true })}
                className={`cursor-pointer border-2 rounded-2xl p-4 transition-all ${selectedCategory === "WEBSITE_ERROR" ? "border-blue-600 bg-blue-50/50 shadow-sm" : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"}`}
              >
                <div className="font-bold text-slate-900 text-sm">Website Bug</div>
                <div className="text-xs text-slate-500 mt-1">Booking errors, account access</div>
              </div>

            </div>
            {errors.category && <p className="mt-2 text-xs font-bold text-red-500">{errors.category.message}</p>}
          </div>

          <hr className="border-slate-100" />

          {/* --- CONDITIONAL VEHICLE FIELD --- */}
          {selectedCategory === "VEHICLE_SERVICE" ? (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
                2. Verify Your Account
              </label>
              <p className="text-xs text-slate-500 mb-3">Please enter your registered vehicle number.</p>
              <input
                {...register("vehicleRegistration")}
                type="text"
                placeholder="e.g., CBA-1234"
                className={`w-full px-4 py-3.5 rounded-xl border bg-slate-50 outline-none font-mono uppercase transition-all ${errors.vehicleRegistration ? "border-red-500 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"}`}
              />
              {errors.vehicleRegistration && <p className="mt-2 text-xs font-bold text-red-500">{errors.vehicleRegistration.message}</p>}
            </div>
          ) : (
            <div className="bg-blue-50/60 border border-blue-100 p-4 rounded-2xl text-xs font-bold text-blue-700">
              💡 Vehicle registration is optional for non-vehicle inquiries like billing or website bugs.
            </div>
          )}

          {/* --- DESCRIPTION --- */}
          <div>
            <div className="flex justify-between items-end mb-2">
              <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider">
                3. Detailed Description
              </label>
              <span className={`text-xs font-bold ${descriptionText.length > 500 ? 'text-red-500' : 'text-slate-400'}`}>
                {descriptionText.length} / 500
              </span>
            </div>
            <textarea
              {...register("issueDescription")}
              className={`w-full px-4 py-3 rounded-xl border bg-slate-50 outline-none h-32 transition-all resize-none ${errors.issueDescription ? "border-red-500 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"}`}
              placeholder="Please describe your issue in detail..."
            ></textarea>
            {errors.issueDescription && <p className="mt-2 text-xs font-bold text-red-500">{errors.issueDescription.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-slate-900 hover:bg-blue-600 text-white font-bold py-4 px-4 rounded-xl shadow-lg transition-all"
          >
            {isSubmitting ? "Processing..." : "Securely Submit Ticket"}
          </button>
        </form>
      </div>

      {/* --- CUSTOM POPUP MODAL --- */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-sm w-full border border-slate-200 text-center">
            <div className={`flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto ${modal.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              {modal.type === 'success' ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              )}
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">{modal.title}</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">{modal.message}</p>
            <button
              onClick={() => setModal({ ...modal, isOpen: false })}
              className={`w-full px-4 py-3 rounded-xl font-bold text-white shadow-md transition-all active:scale-95 ${modal.type === 'success' ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-900 hover:bg-slate-800'}`}
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}