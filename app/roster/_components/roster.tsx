// Shared roster types, formatting and badges.

export type ShiftStatus = "SCHEDULED" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "ABSENT" | "CANCELLED";

export interface Shift {
  shiftId: number;
  staffName: string;
  staffUsername: string | null;
  role: string;
  shiftDate: string;
  shiftType: "MORNING" | "AFTERNOON" | "NIGHT";
  status: ShiftStatus;
  assignment: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  lateMinutes: number | null;
  autoClosed: boolean | null;
  notes: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  workedHours: number | null;
  late: boolean;
}

export interface StaffMember {
  username: string;
  fullName: string;
  role: string;
}

export interface Leave {
  leaveId: number;
  staffUsername: string;
  staffName: string;
  role: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
  days: number;
}

export interface Resources {
  bays: string[];
  pumps: string[];
  blocks: { key: string; start: string; end: string }[];
  minCoverage: Record<string, number>;
  lateGraceMinutes: number;
  clockInEarlyMinutes: number;
}

export const BLOCKS = ["MORNING", "AFTERNOON", "NIGHT"] as const;

export const BLOCK_LABEL: Record<string, string> = {
  MORNING: "Morning 08:00–16:00",
  AFTERNOON: "Afternoon 16:00–00:00",
  NIGHT: "Night 00:00–08:00",
};

export const BLOCK_SHORT: Record<string, string> = { MORNING: "AM", AFTERNOON: "PM", NIGHT: "NT" };

export const roleLabel = (role: string) => role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

export const errorText = (err: unknown, fallback: string) => {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  return typeof data === "string" && data.length < 300 ? data : fallback;
};

// Local-date helpers (the roster works in the station's local time).
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

export const mondayOf = (iso: string) => {
  const d = new Date(iso + "T00:00");
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return isoDate(d);
};

export const fmtDay = (iso: string) =>
  new Date(iso + "T00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";

// Value for <input type="datetime-local"> from a backend LocalDateTime string.
export const toLocalInput = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: "bg-yellow-50 text-yellow-800 border-yellow-200",
  CONFIRMED: "bg-blue-50 text-blue-700 border-blue-200",
  CHECKED_IN: "bg-indigo-50 text-indigo-700 border-indigo-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ABSENT: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-slate-50 text-slate-500 border-slate-200 line-through",
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled", CONFIRMED: "Confirmed", CHECKED_IN: "On duty",
  COMPLETED: "Completed", ABSENT: "Absent", CANCELLED: "Cancelled",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${STATUS_STYLE[status] || STATUS_STYLE.SCHEDULED}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export const shiftChipClass = (status: string) => STATUS_STYLE[status] || STATUS_STYLE.SCHEDULED;

export function Notice({ notice }: { notice: { type: "ok" | "error"; text: string } | null }) {
  if (!notice) return null;
  return (
    <div role="status" className={`px-4 py-3 rounded-xl text-sm font-bold border ${notice.type === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
      {notice.text}
    </div>
  );
}

export const inputClass = "w-full px-3 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
