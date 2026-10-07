"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import api from "../../utils/axiosInstance";

const PHONE_PATTERN = /^\+?[0-9 ()-]{9,20}$/;

// Vehicle number and contact number are only needed when the customer hasn't set
// up their profile yet (or for vehicle issues) — those checks run in onSubmit.
const supportSchema = z.object({
  category: z.enum(["VEHICLE_SERVICE", "BILLING_FINANCE", "WEBSITE_ERROR", "GENERAL_INQUIRY"], {
    message: "Please select a support category.",
  }),
  vehicleRegistration: z.string().optional(),
  contactNumber: z.string().optional(),
  issueDescription: z.string()
    .min(20, "Please provide at least 20 characters of detail so our team can assist you effectively.")
    .max(500, "Description exceeds the 500-character system limit.")
    .refine((val) => val.trim().length >= 20, "Description cannot consist of only blank spaces."),
});

type SupportFormInputs = z.infer<typeof supportSchema>;

interface Profile {
  name: string;
  vehicleRegNo: string;
}

interface Ticket {
  ticketId: number;
  category: string;
  issueDescription: string;
  status: string;
  assignedStaff: string | null;
  dateReported: string;
  resolutionNote: string | null;
}

interface TicketEvent {
  eventId: number;
  action: string;
  toValue: string | null;
  note: string | null;
  createdAt: string;
}

// Each category card, the backend routing category, and the desk it lands on
// (must match ComplaintService.DESK_BY_CATEGORY).
const CATEGORIES = [
  { key: "VEHICLE_SERVICE", title: "Vehicle Service", hint: "Repairs, parts, warranty", backend: "SERVICE", desk: "Service Center Manager" },
  { key: "BILLING_FINANCE", title: "Billing & Finance", hint: "Invoices, payments, refunds", backend: "FINANCE", desk: "Accounts & Finance Officer" },
  { key: "WEBSITE_ERROR", title: "Website Bug", hint: "Booking errors, account access", backend: "WEB", desk: "IT / System Admin" },
  // GENERAL isn't auto-routed: it waits in the CRO's triage queue.
  { key: "GENERAL_INQUIRY", title: "General Inquiry", hint: "Feedback, questions, anything else", backend: "GENERAL", desk: "Customer Relations" },
] as const;

const CATEGORY_NAMES: Record<string, string> = {
  SERVICE: "Vehicle Service", FINANCE: "Billing & Finance", WEB: "Website", FUEL: "Fuel Station", GENERAL: "General",
};

const EVENT_LABELS: Record<string, string> = {
  SUBMITTED: "Ticket received",
  ASSIGNED: "Assigned to a team",
  RESOLVED: "Resolved",
  REOPENED: "Reopened",
};

const ticketRef = (id: number) => `TKT-${String(id).padStart(5, "0")}`;
const formatWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const errorText = (err: unknown, fallback: string) => {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  return typeof data === "string" && data.length < 200 ? data : fallback;
};

function StatusPill({ status }: { status: string }) {
  const style = status === "RESOLVED" ? "bg-green-50 text-green-700 border-green-200"
    : status === "OPEN" ? "bg-yellow-50 text-yellow-700 border-yellow-200"
    : "bg-blue-50 text-blue-700 border-blue-200";
  const label = status === "OPEN" ? "Received" : status === "IN_PROGRESS" ? "In progress" : "Resolved";
  return <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${style}`}>{label}</span>;
}

export default function SubmitTicketPage() {
  // undefined = still loading, null = customer hasn't set up their profile yet
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [openTicket, setOpenTicket] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<TicketEvent[]>([]);

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
    setError,
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
  const needsProfile = profile === null;

  const loadTickets = async () => {
    try {
      const res = await api.get<Ticket[]>("/complaints/my");
      setTickets(res.data);
    } catch {
      setTickets([]);
    }
  };

  useEffect(() => {
    api.get<Profile>("/customers/my-profile")
      .then(res => {
        setProfile(res.data);
        setValue("vehicleRegistration", res.data.vehicleRegNo);
        loadTickets();
      })
      .catch(() => setProfile(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on open
  }, []);

  const onSubmit = async (data: SupportFormInputs) => {
    const vehicle = data.vehicleRegistration?.trim() || "";
    const contact = data.contactNumber?.trim() || "";

    // First ticket: the customer's details are collected in this same form.
    if (needsProfile) {
      let invalid = false;
      if (vehicle.length < 3) {
        setError("vehicleRegistration", { message: "Please enter your registered vehicle number." });
        invalid = true;
      }
      if (!PHONE_PATTERN.test(contact)) {
        setError("contactNumber", { message: "Enter a valid contact number (e.g. +94 77 123 4567)." });
        invalid = true;
      }
      if (invalid) return;

      try {
        const res = await api.post<Profile>("/customers/my-profile", { vehicleRegNo: vehicle, contactNumber: contact });
        setProfile(res.data);
        setValue("vehicleRegistration", res.data.vehicleRegNo);
      } catch (err) {
        setModal({ isOpen: true, type: "error", title: "Profile Not Saved", message: errorText(err, "Please verify your vehicle and contact number.") });
        return;
      }
    }

    try {
      const routing = CATEGORIES.find(c => c.key === data.category);
      // The backend links the ticket to the signed-in customer's own profile and
      // routes it to the right department; the id in the URL is ignored for customers.
      const res = await api.post<Ticket>("/complaints/submit/0", {
        category: routing?.backend ?? "GENERAL",
        issueDescription: data.issueDescription.trim()
      });

      setModal({
        isOpen: true,
        type: "success",
        title: "Ticket Submitted Successfully",
        message: `Your ticket ${ticketRef(res.data.ticketId)} has been sent to the ${routing?.desk ?? "Customer Relations"} desk. We've emailed you a confirmation and will update you as it progresses.`
      });
      reset({ category: data.category, issueDescription: "", vehicleRegistration: vehicle, contactNumber: "" });
      loadTickets();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Ticket not sent", message: errorText(err, "Your request couldn't be sent. Please try again.") });
    }
  };

  const toggleTimeline = async (ticketId: number) => {
    if (openTicket === ticketId) { setOpenTicket(null); return; }
    setOpenTicket(ticketId);
    setTimeline([]);
    try {
      const res = await api.get<TicketEvent[]>(`/complaints/${ticketId}/events`);
      setTimeline(res.data);
    } catch {
      setTimeline([]);
    }
  };

  if (profile === undefined) return null;

  const selectedDesk = CATEGORIES.find(c => c.key === selectedCategory)?.desk;
  const inputClass = (hasError: boolean) =>
    `w-full px-4 py-3.5 rounded-xl border bg-slate-50 outline-none transition-all ${hasError ? "border-red-500 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"}`;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 md:p-12 flex flex-col items-center gap-8 relative">
      <div className="max-w-3xl w-full bg-white p-8 md:p-10 rounded-3xl shadow-lg border border-slate-200 animate-fade-in-up">

        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-sm">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">Support Desk</h1>
        </div>

        <p className="text-slate-500 font-medium mb-8 pb-6 border-b border-slate-100 md:pl-16">
          Submit an issue directly to the Lanka Auto Care CRM team. Your ticket is routed straight to the right department, and you&apos;ll get an email at every step.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

          {/* --- CATEGORY CARDS --- */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
              1. What do you need help with?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="group" aria-label="Support category">
              {CATEGORIES.map(c => (
                <button
                  type="button"
                  key={c.key}
                  onClick={() => setValue("category", c.key, { shouldValidate: true })}
                  aria-pressed={selectedCategory === c.key}
                  className={`text-left cursor-pointer border-2 rounded-2xl p-4 transition-all ${selectedCategory === c.key ? "border-blue-600 bg-blue-50/50 shadow-sm" : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"}`}
                >
                  <div className="font-bold text-slate-900 text-sm">{c.title}</div>
                  <div className="text-xs text-slate-500 mt-1">{c.hint}</div>
                </button>
              ))}
            </div>
            {errors.category && <p className="mt-2 text-xs font-bold text-red-600">{errors.category.message}</p>}
            {selectedDesk && (
              <p className="mt-3 text-xs font-bold text-slate-500">
                Routed to: <span className="text-blue-700">{selectedDesk}</span>
              </p>
            )}
          </div>

          <hr className="border-slate-100" />

          {/* --- ACCOUNT / VEHICLE STEP --- */}
          {needsProfile ? (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
                2. Verify Your Account
              </label>
              <p className="text-xs text-slate-500 mb-3">First ticket? Tell us your vehicle and phone number — we&apos;ll remember them for next time.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="vehicleRegistration" className="sr-only">Vehicle registration</label>
                  <input
                    id="vehicleRegistration"
                    {...register("vehicleRegistration")}
                    type="text"
                    placeholder="Vehicle no. e.g., CBA-1234"
                    className={`${inputClass(!!errors.vehicleRegistration)} font-mono uppercase`}
                  />
                  {errors.vehicleRegistration && <p className="mt-2 text-xs font-bold text-red-600">{errors.vehicleRegistration.message}</p>}
                </div>
                <div>
                  <label htmlFor="contactNumber" className="sr-only">Contact number</label>
                  <input
                    id="contactNumber"
                    {...register("contactNumber")}
                    type="tel"
                    placeholder="Phone e.g., +94 77 123 4567"
                    className={inputClass(!!errors.contactNumber)}
                  />
                  {errors.contactNumber && <p className="mt-2 text-xs font-bold text-red-600">{errors.contactNumber.message}</p>}
                </div>
              </div>
            </div>
          ) : selectedCategory === "VEHICLE_SERVICE" ? (
            <div>
              <label htmlFor="vehicleRegistration" className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
                2. Verify Your Account
              </label>
              <p className="text-xs text-slate-500 mb-3">This ticket will be linked to your registered vehicle.</p>
              <input
                id="vehicleRegistration"
                value={profile?.vehicleRegNo ?? ""}
                readOnly
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-700 outline-none font-mono uppercase"
              />
            </div>
          ) : (
            <div className="bg-blue-50/60 border border-blue-100 p-4 rounded-2xl text-xs font-bold text-blue-700">
              💡 Vehicle registration is optional for non-vehicle inquiries like billing, website bugs or general questions.
            </div>
          )}

          {/* --- DESCRIPTION --- */}
          <div>
            <div className="flex justify-between items-end mb-2">
              <label htmlFor="issueDescription" className="block text-sm font-bold text-slate-700 uppercase tracking-wider">
                3. Detailed Description
              </label>
              <span className={`text-xs font-bold ${descriptionText.length > 500 ? "text-red-600" : "text-slate-500"}`}>
                {descriptionText.length} / 500
              </span>
            </div>
            <textarea
              id="issueDescription"
              {...register("issueDescription")}
              className={`w-full px-4 py-3 rounded-xl border bg-slate-50 outline-none h-32 transition-all resize-none ${errors.issueDescription ? "border-red-500 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"}`}
              placeholder="Please describe your issue in detail..."
            ></textarea>
            {errors.issueDescription && <p className="mt-2 text-xs font-bold text-red-600">{errors.issueDescription.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-slate-900 hover:bg-blue-600 text-white font-bold py-4 px-4 rounded-xl shadow-lg transition-all disabled:opacity-60"
          >
            {isSubmitting ? "Processing..." : "Securely Submit Ticket"}
          </button>
        </form>
      </div>

      {/* --- MY TICKETS --- */}
      {tickets.length > 0 && (
        <div className="max-w-3xl w-full bg-white p-8 md:p-10 rounded-3xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-black text-slate-900 tracking-tight mb-6">My Tickets</h2>
          <ul className="space-y-3">
            {tickets.map(t => (
              <li key={t.ticketId} className="border border-slate-200 rounded-2xl overflow-hidden">
                <button onClick={() => toggleTimeline(t.ticketId)} aria-expanded={openTicket === t.ticketId}
                  className="w-full text-left p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-slate-500">{ticketRef(t.ticketId)}</span>
                      <span className="text-sm font-bold text-slate-900">{CATEGORY_NAMES[t.category] || t.category}</span>
                    </div>
                    <StatusPill status={t.status} />
                  </div>
                  <p className="text-sm text-slate-600 mt-2 line-clamp-2">{t.issueDescription}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    Raised {formatWhen(t.dateReported)}{t.assignedStaff && <> · Handled by {t.assignedStaff}</>}
                  </p>
                </button>

                {openTicket === t.ticketId && (
                  <div className="border-t border-slate-100 bg-slate-50/60 p-4">
                    {t.resolutionNote && (
                      <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
                        <span className="font-bold">Resolution: </span>{t.resolutionNote}
                      </div>
                    )}
                    <ol className="relative border-l-2 border-slate-200 ml-2 space-y-4">
                      {timeline.map(e => (
                        <li key={e.eventId} className="ml-4">
                          <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white" aria-hidden="true"></span>
                          <p className="text-sm font-bold text-slate-900">{EVENT_LABELS[e.action] || e.action}</p>
                          <p className="text-xs text-slate-500">{formatWhen(e.createdAt)}</p>
                          {e.action === "ASSIGNED" && e.toValue && <p className="text-xs text-slate-600 mt-1">Handled by {e.toValue}</p>}
                          {e.note && e.action !== "RESOLVED" && <p className="text-xs text-slate-600 mt-1">{e.note}</p>}
                        </li>
                      ))}
                      {timeline.length === 0 && <li className="ml-4 text-xs text-slate-500">Loading history...</li>}
                    </ol>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- CUSTOM POPUP MODAL --- */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="support-modal-title">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-sm w-full border border-slate-200 text-center">
            <div className={`flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto ${modal.type === "success" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
              {modal.type === "success" ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              )}
            </div>
            <h3 id="support-modal-title" className="text-xl font-bold text-slate-900 mb-2">{modal.title}</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">{modal.message}</p>
            <button
              onClick={() => setModal({ ...modal, isOpen: false })}
              className={`w-full px-4 py-3 rounded-xl font-bold text-white shadow-md transition-all active:scale-95 ${modal.type === "success" ? "bg-green-600 hover:bg-green-700" : "bg-slate-900 hover:bg-slate-800"}`}
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
