// Shared CRM types and small presentational pieces used by the ticket desk,
// the customer directory and the CRM dashboard.

export interface CustomerProfile {
  customerID: number;
  name: string;
  email: string;
  vehicleRegNo: string;
  contactNumber: string;
  registeredAt?: string;
  username?: string | null;
  loyaltyPoints: number;
  lifetimePoints: number;
  membershipTier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  nextTier: string | null;
  nextTierAt: number | null;
  pointsToNextTier: number | null;
}

export interface LoyaltyTransaction {
  transactionId: number;
  customerId: number;
  customerName: string;
  type: "EARNED" | "ADJUSTMENT";
  points: number;
  balanceAfter: number;
  bookingId: number | null;
  reason: string | null;
  performedBy: string;
  createdAt: string;
}

export const TIER_ORDER = ["BRONZE", "SILVER", "GOLD", "PLATINUM"] as const;

// "+120" / "−50" with a real minus sign.
export const signedPoints = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : `−${Math.abs(n).toLocaleString()}`);

export interface Ticket {
  ticketId: number;
  customer: CustomerProfile;
  category: string;
  issueDescription: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  assignedStaff: string | null;
  dateReported: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  slaDueAt: string | null;
  escalationLevel: number;
  escalated: boolean;
  slaBreached: boolean;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface TicketEvent {
  eventId: number;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  note: string | null;
  performedBy: string;
  internalOnly: boolean;
  createdAt: string;
}

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

// Must match the desk labels in ComplaintService.DESK_BY_ROLE.
export const DESKS = [
  "Customer Relations",
  "Service Center Manager",
  "Fuel Station Supervisor",
  "Accounts & Finance Officer",
  "System Admin",
];

export const CATEGORY_NAMES: Record<string, string> = {
  SERVICE: "Service", FINANCE: "Finance", FUEL: "Fuel", WEB: "IT / Web", GENERAL: "General",
};

export const ticketRef = (id: number) => `TKT-${String(id).padStart(5, "0")}`;

export const formatWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

export const errorText = (err: unknown, fallback: string) => {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  return typeof data === "string" && data.length < 200 ? data : fallback;
};

// "due in 3h", "overdue by 2d" — relative to now.
export function slaText(ticket: Ticket): { text: string; overdue: boolean } | null {
  if (ticket.status === "RESOLVED" || !ticket.slaDueAt) return null;
  const minutes = Math.round((new Date(ticket.slaDueAt).getTime() - Date.now()) / 60000);
  const abs = Math.abs(minutes);
  const span = abs >= 1440 ? `${Math.round(abs / 1440)}d` : abs >= 60 ? `${Math.round(abs / 60)}h` : `${abs}m`;
  return minutes < 0 ? { text: `Overdue by ${span}`, overdue: true } : { text: `Due in ${span}`, overdue: false };
}

const PRIORITY_STYLE: Record<string, string> = {
  URGENT: "bg-red-50 text-red-700 border-red-200",
  HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  MEDIUM: "bg-slate-50 text-slate-700 border-slate-200",
  LOW: "bg-slate-50 text-slate-500 border-slate-200",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${PRIORITY_STYLE[priority] || PRIORITY_STYLE.MEDIUM}`}>
      {priority === "URGENT" && <span aria-hidden="true">▲</span>}
      {priority}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const style = status === "OPEN" ? "bg-yellow-50 text-yellow-800 border-yellow-200"
    : status === "RESOLVED" ? "bg-green-50 text-green-700 border-green-200"
    : "bg-blue-50 text-blue-700 border-blue-200";
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${style}`}>
      {status.replace("_", " ")}
    </span>
  );
}

const TIER_STYLE: Record<string, string> = {
  PLATINUM: "bg-slate-900 text-white border-slate-900",
  GOLD: "bg-yellow-100 text-yellow-800 border-yellow-300",
  SILVER: "bg-slate-100 text-slate-700 border-slate-300",
  BRONZE: "bg-orange-50 text-orange-800 border-orange-200",
};

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${TIER_STYLE[tier] || TIER_STYLE.BRONZE}`}>
      {tier}
    </span>
  );
}

export const EVENT_LABELS: Record<string, string> = {
  SUBMITTED: "Ticket submitted",
  ASSIGNED: "Assigned",
  PRIORITY_CHANGED: "Priority changed",
  ESCALATED: "Escalated (SLA breached)",
  RESOLVED: "Resolved",
  REOPENED: "Reopened",
};
