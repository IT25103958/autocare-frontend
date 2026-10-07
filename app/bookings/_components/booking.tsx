// Shared types, labels and helpers for service bookings (workshop + customer portal).

export type BookingStatus = "PENDING" | "CONFIRMED" | "IN_PROGRESS" | "DELAYED" | "COMPLETED" | "PAID" | "CANCELLED";

export interface Booking {
  bookingID: number;
  customerUsername: string | null;
  // Name / phone taken down for a walk-in without a web account.
  walkInName: string | null;
  walkInPhone: string | null;
  vehicleRegNo: string;
  servicePackage: string;
  packageId: number | null;
  quotedPrice: number | null;
  durationMinutes: number | null;
  preferredDate: string;
  scheduledEnd: string | null;
  status: BookingStatus | string;
  assignedTechnicianUsername: string | null;
  technicianName: string | null;
  assignedServiceBay: string | null;
  // The manager who allocated the technician and bay; null means not allocated yet.
  assignedBy: string | null;
  assignedAt: string | null;
  customerNotes: string | null;
  managerNotes: string | null;
  technicianNotes: string | null;
  delayReason: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  // Vehicle released to the customer (only possible once the bill is paid).
  handedOverAt: string | null;
  handedOverBy: string | null;
  laborCharge: number | null;
  subTotal: number | null;
  discountAmount: number | null;
  taxAmount: number | null;
  netTotal: number | null;
  totalPartsCost: number | null;
  partsUsedSummary: string | null;
  createdAt: string | null;
}

export interface ServicePackage {
  packageId: number;
  name: string;
  description: string | null;
  price: number;
  durationMinutes: number;
  active: boolean;
}

export interface BookingEvent {
  eventId: number;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  performedBy: string;
  createdAt: string;
}

export interface Slot {
  time: string;
  remaining: number;
  available: boolean;
}

export const STATUS_LABEL: Record<string, string> = {
  PENDING: "Requested",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  DELAYED: "Delayed",
  COMPLETED: "Ready for pickup",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-800 border-amber-200",
  CONFIRMED: "bg-blue-50 text-blue-700 border-blue-200",
  IN_PROGRESS: "bg-indigo-50 text-indigo-700 border-indigo-200",
  DELAYED: "bg-orange-50 text-orange-800 border-orange-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PAID: "bg-emerald-50 text-emerald-800 border-emerald-200",
  CANCELLED: "bg-slate-50 text-slate-500 border-slate-200",
};

export function BookingStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${STATUS_STYLE[status] || STATUS_STYLE.CANCELLED}`}>
      {STATUS_LABEL[status] || status.replace(/_/g, " ")}
    </span>
  );
}

export const EVENT_LABEL: Record<string, string> = {
  BOOKED: "Booking received",
  CONFIRMED: "Appointment confirmed",
  REASSIGNED: "Technician changed",
  RESCHEDULED: "Rescheduled",
  STARTED: "Work started",
  DELAYED: "Delayed",
  RESUMED: "Work resumed",
  COMPLETED: "Work completed",
  PAID: "Payment received",
  HANDED_OVER: "Vehicle handed over",
  PAYMENT_REOPENED: "Bill re-opened",
  CANCELLED: "Cancelled",
  REQUEUED: "Re-opened",
};

export const jobRef = (id: number) => `JOB-${id}`;

export const rupees = (n: number | null | undefined) =>
  `Rs. ${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export const fmtDuration = (minutes: number | null) => {
  const m = minutes ?? 60;
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
};

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const errorText = (err: unknown, fallback: string) => {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  return typeof data === "string" && data.length < 300 ? data : fallback;
};

export const ACTIVE_STATUSES = ["PENDING", "CONFIRMED", "IN_PROGRESS", "DELAYED"];

export function Notice({ notice }: { notice: { type: "ok" | "error"; text: string } | null }) {
  if (!notice) return null;
  return (
    <div role="status" className={`px-4 py-3 rounded-xl text-sm font-bold border ${notice.type === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
      {notice.text}
    </div>
  );
}

export const inputClass = "w-full px-3 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
