// Shared billing types and helpers (finance billing page, POS, customer portal).
import api from "../../../utils/axiosInstance";

export interface Invoice {
  invoiceId: number;
  invoiceNumber: string;
  sourceType: "SERVICE_JOB" | "POS_SALE";
  sourceId: number;
  customerUsername: string | null;
  customerName: string | null;
  customerEmail: string | null;
  vehicleRegNo: string | null;
  description: string;
  lineSummary: string | null;
  subTotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  issuedAt: string;
  paidAt: string | null;
  // Methods used so far, e.g. "Loyalty points, Online card".
  paidVia: string | null;
}

export interface Payment {
  paymentId: number;
  invoiceId: number;
  receiptNumber: string;
  method: "CASH" | "CARD" | "BANK_TRANSFER" | "ONLINE" | "LOYALTY_POINTS";
  amount: number;
  amountTendered: number | null;
  changeGiven: number | null;
  reference: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  pointsRedeemed: number | null;
  // ONLINE only: CARD / BANK / WALLET, the bank or wallet, and the last digits of the account.
  onlineChannel: "CARD" | "BANK" | "WALLET" | null;
  provider: string | null;
  accountMask: string | null;
  // Filled in by the server: "Online banking" and "Online banking — City Commercial Bank ending 5678".
  methodName: string;
  methodLabel: string;
  receivedBy: string;
  paidAt: string;
}

export interface PlanInstallment {
  number: number;
  dueDate: string;
  amount: number;
  paid: number;
  status: "PAID" | "DUE" | "OVERDUE" | "UPCOMING";
}

// A customer's instalment schedule for one invoice (accounts receivable).
export interface RepaymentPlan {
  planId: number;
  installments: number;
  frequency: "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";
  firstDueDate: string;
  plannedAmount: number;
  installmentAmount: number;
  paidTowardsPlan: number;
  installmentsPaid: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  overdueCount: number;
  overdueAmount: number;
  amountDueNow: number;
  note: string | null;
  createdBy: string;
  createdAt: string;
  schedule: PlanInstallment[];
}

export interface ReceivableRow {
  invoice: Invoice;
  ageDays: number;
  bucket: string;
  plan: RepaymentPlan | null;
}

export interface Receivables {
  asOf: string;
  invoiceCount: number;
  totalOutstanding: number;
  buckets: { label: string; count: number; amount: number }[];
  planCount: number;
  onPlanAmount: number;
  overduePlanCount: number;
  overdueInstallmentAmount: number;
  rows: ReceivableRow[];
}

export interface InvoiceDetail {
  invoice: Invoice;
  payments: Payment[];
  loyaltyPoints: number;
  pointValue: number;
  plan: RepaymentPlan | null;
}

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  ONLINE: "Online (gateway)",
  LOYALTY_POINTS: "Loyalty points",
};

export const lkr = (n: number | null | undefined) =>
  `Rs. ${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtDay = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

export const FREQUENCY_LABEL: Record<string, string> = { WEEKLY: "weekly", FORTNIGHTLY: "fortnightly", MONTHLY: "monthly" };

// Local calendar date as YYYY-MM-DD (toISOString would give the UTC date).
export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Save rows as a CSV file that opens in Excel.
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  // The BOM makes Excel read the file as UTF-8.
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${isoDate(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const errText = (err: unknown, fallback: string) => {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === "string" && data.length < 300) return data;
  return fallback;
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  const style = status === "PAID" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : status === "PARTIALLY_PAID" ? "bg-amber-50 text-amber-800 border-amber-200"
    : "bg-red-50 text-red-700 border-red-200";
  const label = status === "PARTIALLY_PAID" ? "Part paid" : status === "PAID" ? "Paid" : "Unpaid";
  return <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${style}`}>{label}</span>;
}

export function paymentText(p: Payment) {
  let s = p.methodLabel || METHOD_LABEL[p.method] || p.method;
  if (p.method === "CASH" && p.changeGiven && p.changeGiven > 0) s += ` · change ${lkr(p.changeGiven)}`;
  if (p.reference && (p.method === "ONLINE" || p.method === "BANK_TRANSFER")) s += ` · ${p.reference}`;
  return s;
}

// Download a file from the API (it needs the auth header, so a plain link won't do).
// A failed request comes back as a blob too, so its text is unpacked for the error message.
export async function downloadFile(path: string, filename: string, params?: Record<string, string>) {
  let res;
  try {
    res = await api.get(path, { responseType: "blob", params });
  } catch (err) {
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    if (data instanceof Blob) throw { response: { data: await data.text() } };
    throw err;
  }
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Download the PDF receipt/invoice for a customer bill.
export const downloadReceipt = (invoiceId: number, invoiceNumber: string) =>
  downloadFile(`/invoices/${invoiceId}/receipt`, `${invoiceNumber}.pdf`);

export const inputClass = "w-full px-3 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
