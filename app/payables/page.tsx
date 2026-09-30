"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import axios, { AxiosInstance } from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../context/AuthContext";

// =============================================================================
// API CLIENT
// Your project already has utils/axiosInstance.ts — once you share what it
// exports, this page should import that shared client instead of building its
// own. Kept self-contained here for now so nothing breaks on an unverified
// import path or interceptor contract.
// =============================================================================
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

const api: AxiosInstance = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("jwtToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const responseData = err.response?.data;
    if (typeof responseData === "string" && responseData.trim()) return responseData;
    if (responseData && typeof responseData === "object" && "message" in responseData) {
      const msg = (responseData as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
  }
  return fallback;
}

// =============================================================================
// VALIDATION
// =============================================================================
function isPastDate(value: string): boolean {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

const invoiceSchema = z.object({
  supplierName: z.string()
    .min(2, "Supplier name must be at least 2 characters.")
    .max(100, "Name exceeds maximum limit.")
    .regex(/^[a-zA-Z0-9\s\-.,&'()]+$/, "Contains invalid special characters."),
  supplyCategory: z.enum(["SPARE_PARTS", "FUEL", "EQUIPMENT", "MAINTENANCE"]),
  totalInvoiceAmount: z.coerce.number()
    .min(0.01, "Amount must be greater than Rs. 0.")
    .max(100000000, "Amount exceeds enterprise transaction limits."),
  dueDate: z.string()
    .min(1, "Due date is required.")
    .refine((v) => !isPastDate(v), "Due date can't be in the past."),
});

// zod v4 + @hookform/resolvers v5 type numeric-coercion fields differently on
// the way in vs the way out: an <input type="number"> hands react-hook-form a
// string, and z.coerce.number() only turns it into a real number *after*
// validation. Using a single generic on useForm() (as older zod v3 code did)
// makes totalInvoiceAmount type as `unknown` and breaks handleSubmit's typing
// project-wide. The fix is RHF's 3-generic form: input shape, context, output
// shape — input is what the raw form fields are before parsing, output is
// what onSubmit actually receives after zod has validated and coerced it.
type InvoiceFormInput = z.input<typeof invoiceSchema>;
type InvoiceFormOutput = z.output<typeof invoiceSchema>;

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// A tiny epsilon guards every money comparison in this file against floating
// point noise (e.g. 45000.1 - 44999.99 not landing on exactly 0.11), which is
// what previously let a legitimate full payment get rejected as "overpayment"
// or a fully-paid invoice get miscategorized by a hair.
const MONEY_EPSILON = 0.005;

// =============================================================================
// TYPES
// =============================================================================
interface PaymentRecord {
  amountPaid: number;
  paymentDate: string;
  processedBy: string;
}

interface AccountsPayable {
  invoiceId: number;
  supplierId?: number | null;
  supplierName: string;
  supplyCategory: string;
  totalInvoiceAmount: number;
  amountPaid: number;
  status: string;
  dueDate: string;
  paymentHistory: PaymentRecord[];
}

interface ServiceBooking {
  bookingID: number;
  vehicleRegNo: string;
  servicePackage: string;
  status: string;
  totalPartsCost: number;
  preferredDate: string;
}

interface RmaRefund {
  id: number;
  partName: string;
  partCode: string;
  quantity: number;
  reason: string;
  supplierId?: number | null;
  supplierName: string;
  totalValue: number;
  status: string;
  financialStatus: string;
  dateLogged: string;
}

// Same supplier? Compare supplier-master ids when both rows have one; fall
// back to the name for rows recorded before suppliers had ids.
function sameSupplier(inv: AccountsPayable, rma: RmaRefund) {
  if (inv.supplierId != null && rma.supplierId != null) return inv.supplierId === rma.supplierId;
  return inv.supplierName.toLowerCase() === rma.supplierName.toLowerCase();
}

interface RetailTransaction {
  transactionId: number;
  itemsSummary: string;
  totalRevenue: number;
}

interface SalaryRecord {
  salaryId: number;
  totalSalary?: number;
  netSalary?: number;
}

interface ShiftHandover {
  id: number;
  declaredCash: number;
  status: string;
}

interface FetchErrors {
  payables?: boolean;
  pos?: boolean;
  bookings?: boolean;
  rma?: boolean;
  salary?: boolean;
  handovers?: boolean;
}

type InvoiceStatus = "PENDING" | "PARTIAL" | "OVERDUE" | "PAID";
type PayablesFilter = "OUTSTANDING" | "OVERDUE" | "PAID" | "ALL";
type ToastType = "success" | "error" | "info";
interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}
interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone: "default" | "danger";
  pending: boolean;
  onConfirm: () => void | Promise<void>;
}
const CLOSED_CONFIRM: ConfirmState = {
  isOpen: false, title: "", message: "", confirmLabel: "Confirm", tone: "default", pending: false, onConfirm: () => {},
};

// A single source of truth for "what state is this invoice in" — previously
// this logic was written twice (once in the KPI summary, once in the table
// row render) and could silently drift apart. Now both read from here.
//
// Balance is clamped at 0 for display: a payable "balance due" going negative
// isn't a meaningful accounting figure to show as-is, it's a sign the invoice
// was overpaid (bad historical data, a duplicate payment, etc). isOverpaid /
// overpaidAmount surface that as a distinct, visible flag instead of hiding
// it behind a confusing negative number or silently rounding it away.
function getInvoiceStatus(inv: AccountsPayable): { balance: number; isOverdue: boolean; status: InvoiceStatus; isOverpaid: boolean; overpaidAmount: number } {
  const rawBalance = roundMoney(inv.totalInvoiceAmount - inv.amountPaid);
  const balance = Math.max(rawBalance, 0);
  const isOverpaid = rawBalance < -MONEY_EPSILON;
  const overpaidAmount = isOverpaid ? Math.abs(rawBalance) : 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(inv.dueDate); due.setHours(0, 0, 0, 0);
  const isOverdue = due < today && balance > MONEY_EPSILON;

  let status: InvoiceStatus = "PENDING";
  if (rawBalance <= MONEY_EPSILON) status = "PAID";
  else if (isOverdue) status = "OVERDUE";
  else if (inv.amountPaid > 0) status = "PARTIAL";
  return { balance, isOverdue, status, isOverpaid, overpaidAmount };
}

// =============================================================================
// SMALL, DEPENDENCY-FREE ICON SET
// =============================================================================
const s = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
function IconCheckCircle({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M9 12.75l1.5 1.5 3.75-4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function IconAlertTriangle({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM10.29 3.86l-8.18 14.16A1.5 1.5 0 003.5 20.5h17a1.5 1.5 0 001.39-2.48L13.71 3.86a1.5 1.5 0 00-2.42 0z" /></svg>;
}
function IconXCircle({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function IconInfo({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M11.25 11.25h.75v4.5h.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zM12 8.25h.008v.008H12V8.25z" /></svg>;
}
function IconTrash({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
}
function IconSearch({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M21 21l-4.35-4.35m1.6-5.4a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}
function IconDownload({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3" /></svg>;
}
function IconRefresh({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
}
function IconClock({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function IconChevronLeft({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>;
}
function IconChevronRight({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>;
}
function IconWrench({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26" /></svg>;
}
function IconShoppingBag({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m-3 0h13.5l-1.03 9.28A2.25 2.25 0 0115.485 21.75H8.515a2.25 2.25 0 01-2.235-1.97L5.25 10.5z" /></svg>;
}

// =============================================================================
// SMALL REUSABLE UTILITIES
// =============================================================================
function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const pageItems = useMemo(
    () => items.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [items, clampedPage, pageSize]
  );
  return { page: clampedPage, setPage, totalPages, pageItems };
}

function PaginationBar<T>({ pagination, itemLabel }: { pagination: ReturnType<typeof usePagination<T>>; itemLabel: string }) {
  if (pagination.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
      <span className="text-xs font-bold text-slate-400">Page {pagination.page} of {pagination.totalPages} {itemLabel}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => pagination.setPage((p) => Math.max(1, p - 1))} disabled={pagination.page === 1}
          aria-label="Previous page" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors">
          <IconChevronLeft />
        </button>
        <button onClick={() => pagination.setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={pagination.page === pagination.totalPages}
          aria-label="Next page" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors">
          <IconChevronRight />
        </button>
      </div>
    </div>
  );
}

function usePortalTarget() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.body); }, []);
  return target;
}

// A flex layout (icon + input side by side) instead of an absolutely
// positioned icon overlaid on the input. Absolute positioning depends on the
// padding math lining up exactly with the icon's rendered size, and silently
// breaks (icon drifts under the text) if that padding is ever a pixel off or
// an ancestor's CSS interferes — a flex row can't overlap by construction.
function SearchInput({ value, onChange, placeholder, ariaLabel, className = "w-56", dense = false }: {
  value: string; onChange: (v: string) => void; placeholder: string; ariaLabel: string; className?: string; dense?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 bg-slate-100 border border-transparent focus-within:border-blue-400 focus-within:bg-white rounded-xl transition-colors ${dense ? "px-2.5 py-1.5" : "px-3 py-2"} ${className}`}>
      <IconSearch c={`${dense ? "w-3 h-3" : "w-3.5 h-3.5"} text-slate-400 flex-shrink-0`} />
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel}
        className={`bg-transparent outline-none font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-medium w-full min-w-0 ${dense ? "text-[11px]" : "text-xs"}`}
      />
    </div>
  );
}

function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportPayablesCSV(rows: AccountsPayable[]) {
  const headers = ["Invoice ID", "Supplier", "Category", "Due Date", "Invoice Total", "Amount Paid", "Balance", "Status"];
  const body = rows.map((inv) => {
    const { balance, status } = getInvoiceStatus(inv);
    return [inv.invoiceId, inv.supplierName, inv.supplyCategory, inv.dueDate, inv.totalInvoiceAmount, inv.amountPaid, balance, status];
  });
  downloadCSV("payables-ledger", headers, body);
}

function exportWorkshopCSV(rows: ServiceBooking[]) {
  const headers = ["Job Reference", "Vehicle Plate", "Status", "Invoiced Amount"];
  const body = rows.map((job) => [`JOB-${job.bookingID}`, (job.vehicleRegNo || "").toUpperCase(), job.status, job.totalPartsCost || 0]);
  downloadCSV("workshop-revenue", headers, body);
}

function exportRetailCSV(rows: RetailTransaction[]) {
  const headers = ["Receipt Ref", "Summary", "Cash Received"];
  const body = rows.map((txn) => [`TXN-${txn.transactionId}`, txn.itemsSummary, txn.totalRevenue]);
  downloadCSV("retail-revenue", headers, body);
}

type TabType = "PAYABLES" | "RMA_CREDITS" | "REVENUE";

export default function PayablesDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("PAYABLES");

  const [invoices, setInvoices] = useState<AccountsPayable[]>([]);
  const [retailRevenue, setRetailRevenue] = useState<RetailTransaction[]>([]);
  const [workshopRevenue, setWorkshopRevenue] = useState<ServiceBooking[]>([]);
  const [rmas, setRmas] = useState<RmaRefund[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchErrors, setFetchErrors] = useState<FetchErrors>({});

  const [paymentInputs, setPaymentInputs] = useState<{ [key: number]: string }>({});
  const [pendingPaymentIds, setPendingPaymentIds] = useState<Set<number>>(new Set());
  const [settlementPending, setSettlementPending] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [historyModal, setHistoryModal] = useState<AccountsPayable | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(CLOSED_CONFIRM);

  const [payablesFilter, setPayablesFilter] = useState<PayablesFilter>("OUTSTANDING");
  const [payablesSearch, setPayablesSearch] = useState("");
  const [rmaSearch, setRmaSearch] = useState("");
  const [workshopSearch, setWorkshopSearch] = useState("");
  const [retailSearch, setRetailSearch] = useState("");

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const portalTarget = usePortalTarget();

  const [settlementModal, setSettlementModal] = useState<{
    isOpen: boolean; rma: RmaRefund | null; method: "CASH" | "OFFSET"; targetInvoiceId: number | null;
  }>({ isOpen: false, rma: null, method: "OFFSET", targetInvoiceId: null });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InvoiceFormInput, any, InvoiceFormOutput>({
    resolver: zodResolver(invoiceSchema),
    mode: "onChange",
    defaultValues: { supplyCategory: "FUEL" },
  });

  const pushToast = useCallback((type: ToastType, message: string) => {
    setToasts((prev) => {
      if (prev.some((t) => t.type === type && t.message === message)) return prev;
      const id = Date.now() + Math.random();
      window.setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000);
      return [...prev, { id, type, message }];
    });
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const formatLKR = useCallback(
    (amount: number) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(amount || 0),
    []
  );
  // Full precision is too wide for a KPI card at 5-across (it was clipping to
  // "LKR 1,344,2…"), so the cards use compact notation instead — the exact
  // figure is still available in the `title` tooltip and everywhere else
  // (tables, CSV, modals) still uses formatLKR at full precision.
  const formatCompactLKR = useCallback(
    (amount: number) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", notation: "compact", maximumFractionDigits: 2 }).format(amount || 0),
    []
  );

  // ---------------------------------------------------------------------------
  // DATA FETCHING
  // THE CORE FIX: this now reads the full ledger from GET /api/payables instead
  // of GET /api/payables/outstanding. The old endpoint only ever returns
  // invoices with a balance still owing, so the instant a bill was paid off in
  // full it silently vanished from every list this page could show — taking
  // its entire payment history with it, with no way to look it up again.
  // If your backend doesn't have a full-ledger GET /api/payables endpoint yet,
  // add one (return accountsPayableRepository.findAll()) — it's already
  // permitted by your SecurityConfig's /api/payables/** GET rule.
  //
  // Also pulls GET /api/salary so payroll shows up in the Net Cash Position
  // card below — it previously wasn't fetched here at all, so authorizing a
  // salary payout had no visible effect on this page's cash figures.
  // ---------------------------------------------------------------------------
  const fetchAll = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true); else setLoading(true);

    const [payRes, posRes, bookRes, rmaRes, salaryRes, handoverRes] = await Promise.allSettled([
      api.get<AccountsPayable[]>("/api/payables"),
      api.get<RetailTransaction[]>("/api/pos/history"),
      api.get<ServiceBooking[]>("/api/bookings"),
      api.get<RmaRefund[]>("/api/rma"),
      api.get<SalaryRecord[]>("/api/salary"),
      api.get<ShiftHandover[]>("/api/pumps/handovers"),
    ]);

    const errors: FetchErrors = {};
    const payables = payRes.status === "fulfilled" ? payRes.value.data : (errors.payables = true, []);
    const pos = posRes.status === "fulfilled" ? posRes.value.data : (errors.pos = true, []);
    const bookings = bookRes.status === "fulfilled" ? bookRes.value.data : (errors.bookings = true, []);
    const rmaData = rmaRes.status === "fulfilled" ? rmaRes.value.data : (errors.rma = true, []);
    const salaryData = salaryRes.status === "fulfilled" ? salaryRes.value.data : (errors.salary = true, []);
    const handoverData = handoverRes.status === "fulfilled" ? handoverRes.value.data : (errors.handovers = true, []);

    setInvoices(payables);
    setRetailRevenue([...pos].reverse());
    setWorkshopRevenue(
      bookings.filter((b) => b.status === "PAID" || b.status === "COMPLETED").sort((a, b) => b.bookingID - a.bookingID)
    );
    setRmas(rmaData.filter((r) => r.status === "APPROVED_REFUND" || r.financialStatus === "SETTLED"));
    setSalaries(salaryData);
    setHandovers(handoverData);
    setFetchErrors(errors);
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);

    if (Object.keys(errors).length > 0) {
      pushToast("error", `Couldn't load: ${Object.keys(errors).join(", ")}. Figures below may be incomplete.`);
    } else if (isManualRefresh) {
      pushToast("success", "Ledger refreshed.");
    }
  }, [pushToast]);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // ADD INVOICE
  // ---------------------------------------------------------------------------
  const onSubmit = async (data: InvoiceFormOutput) => {
    try {
      const payload = { ...data, totalInvoiceAmount: roundMoney(data.totalInvoiceAmount), amountPaid: 0.0 };
      await api.post("/api/payables/add", payload);
      pushToast("success", `Invoice for ${data.supplierName} registered to the ledger.`);
      reset();
      setIsFormOpen(false);
      await fetchAll();
    } catch (err) {
      pushToast("error", extractErrorMessage(err, "Failed to log this invoice. Please try again."));
    }
  };

  // ---------------------------------------------------------------------------
  // PAYMENTS — validated with the same rigor as the invoice form, epsilon-safe
  // overpayment check, a confirm step when a payment fully settles a bill, and
  // a per-invoice pending flag so double-clicking "Pay" can't fire twice.
  // ---------------------------------------------------------------------------
  const validatePaymentAmount = useCallback((raw: string, balance: number): { amount: number } | { error: string } => {
    const schema = z.coerce.number()
      .positive("Amount must be greater than Rs. 0.00.")
      .refine((v) => roundMoney(v) === Math.round(v * 100) / 100, "Amounts can have at most 2 decimal places.")
      .refine((v) => v <= balance + MONEY_EPSILON, `Amount exceeds the outstanding balance of ${formatLKR(balance)}.`);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Enter a valid payment amount." };
    return { amount: roundMoney(parsed.data) };
  }, [formatLKR]);

  const submitPayment = useCallback(async (invoiceId: number, amountToPay: number, isFullSettlement: boolean) => {
    setPendingPaymentIds((prev) => new Set(prev).add(invoiceId));
    try {
      await api.put(`/api/payables/${invoiceId}/pay`, null, { params: { paymentAmount: amountToPay } });
      setPaymentInputs((prev) => ({ ...prev, [invoiceId]: "" }));
      pushToast("success", `Disbursed ${formatLKR(amountToPay)}.${isFullSettlement ? " Invoice fully settled." : " Balance updated."}`);
      await fetchAll();
    } catch (err) {
      pushToast("error", extractErrorMessage(err, "Server rejected the payment. Please try again."));
    } finally {
      setPendingPaymentIds((prev) => { const next = new Set(prev); next.delete(invoiceId); return next; });
      setConfirmState(CLOSED_CONFIRM);
    }
  }, [fetchAll, pushToast, formatLKR]);

  const handlePayment = useCallback((invoiceId: number, balance: number) => {
    const raw = paymentInputs[invoiceId];
    if (!raw) {
      pushToast("error", "Enter a payment amount first.");
      return;
    }
    const result = validatePaymentAmount(raw, balance);
    if ("error" in result) {
      pushToast("error", result.error);
      return;
    }
    const isFullSettlement = Math.abs(result.amount - balance) < MONEY_EPSILON;
    if (isFullSettlement) {
      setConfirmState({
        isOpen: true,
        tone: "default",
        title: "Fully settle this invoice?",
        message: `You're about to pay the remaining ${formatLKR(result.amount)} in full. The invoice will move to Paid.`,
        confirmLabel: "Confirm payment",
        pending: false,
        onConfirm: () => submitPayment(invoiceId, result.amount, true),
      });
    } else {
      submitPayment(invoiceId, result.amount, false);
    }
  }, [paymentInputs, validatePaymentAmount, formatLKR, submitPayment, pushToast]);

  // ---------------------------------------------------------------------------
  // RMA CREDIT SETTLEMENT
  // ---------------------------------------------------------------------------
  const openSettlementModal = (rma: RmaRefund) => {
    const matchingInvoice = invoices.find((inv) =>
      sameSupplier(inv, rma) && getInvoiceStatus(inv).balance > MONEY_EPSILON
    );
    setSettlementModal({
      isOpen: true, rma,
      method: matchingInvoice ? "OFFSET" : "CASH",
      targetInvoiceId: matchingInvoice ? matchingInvoice.invoiceId : null,
    });
  };

  const executeSettlement = useCallback(async () => {
    const { rma, method, targetInvoiceId } = settlementModal;
    if (!rma) return;
    if (method === "OFFSET" && !targetInvoiceId) {
      pushToast("error", "Select an active invoice to offset this credit against.");
      return;
    }
    setSettlementPending(true);
    try {
      if (method === "OFFSET") {
        const invoice = invoices.find((i) => i.invoiceId === targetInvoiceId);
        if (!invoice) { pushToast("error", "Selected invoice could not be found."); return; }
        const { balance } = getInvoiceStatus(invoice);
        const offsetAmount = roundMoney(Math.min(balance, rma.totalValue));
        await api.put(`/api/payables/${targetInvoiceId}/pay`, null, { params: { paymentAmount: offsetAmount } });
        await api.put(`/api/rma/${rma.id}/settle`, {});
        const leftover = roundMoney(rma.totalValue - offsetAmount);
        pushToast("success",
          `Offset ${formatLKR(offsetAmount)} against Invoice #${targetInvoiceId}.` +
          (leftover > MONEY_EPSILON ? ` ${formatLKR(leftover)} of credit exceeded the balance and was not applied.` : "")
        );
      } else {
        await api.put(`/api/rma/${rma.id}/settle`, {});
        pushToast("success", `RMA-${rma.id} marked as a direct deposit of ${formatLKR(rma.totalValue)}.`);
      }
      setSettlementModal({ isOpen: false, rma: null, method: "OFFSET", targetInvoiceId: null });
      await fetchAll();
    } catch (err) {
      pushToast("error", extractErrorMessage(err, "Unable to process the RMA settlement."));
    } finally {
      setSettlementPending(false);
    }
  }, [settlementModal, invoices, fetchAll, pushToast, formatLKR]);

  // ---------------------------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------------------------
  const executeDelete = useCallback(async (invoiceId: number) => {
    setConfirmState((prev) => ({ ...prev, pending: true }));
    try {
      await api.delete(`/api/payables/${invoiceId}`);
      pushToast("success", "Invoice voided and removed from the ledger.");
      await fetchAll();
    } catch (err) {
      pushToast("error", extractErrorMessage(err, "Unable to delete this invoice. It may be locked by the system."));
    } finally {
      setConfirmState(CLOSED_CONFIRM);
    }
  }, [fetchAll, pushToast]);

  const handleDeleteClick = (inv: AccountsPayable) => {
    setConfirmState({
      isOpen: true,
      tone: "danger",
      title: "Void this liability?",
      message: `Permanently remove the invoice for ${inv.supplierName} from the payables ledger. This cannot be undone.`,
      confirmLabel: "Yes, void invoice",
      pending: false,
      onConfirm: () => executeDelete(inv.invoiceId),
    });
  };

  // ---------------------------------------------------------------------------
  // DERIVED DATA
  // ---------------------------------------------------------------------------
  const { totalDebt, pendingCount, overdueCount, upcomingDue, totalIncome, totalPayrollPaid, totalPaidToSuppliers, netCashPosition, workshopCollected, workshopAwaiting, fuelCashCleared, unsettledRmaCount, unsettledRmaTotal, ledgerStatus, isLedgerHealthy } = useMemo(() => {
    let debt = 0, pending = 0, overdue = 0, upcoming = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(); nextWeek.setDate(today.getDate() + 7); nextWeek.setHours(23, 59, 59, 999);

    invoices.forEach((inv) => {
      const { balance, status } = getInvoiceStatus(inv);
      if (balance > MONEY_EPSILON) {
        debt += balance;
        pending++;
        const due = new Date(inv.dueDate); due.setHours(0, 0, 0, 0);
        if (due >= today && due <= nextWeek) upcoming += balance;
      }
      if (status === "OVERDUE") overdue++;
    });

    const posRev = retailRevenue.reduce((sum, txn) => sum + (txn.totalRevenue || 0), 0);

    // WORKSHOP: only PAID jobs are cash. COMPLETED means the job is done and
    // invoiced but the customer hasn't paid yet (the backend only flips it to
    // PAID in settlePayment, when the money is actually collected). This page
    // used to add both together, so uncollected invoices were being counted
    // as cash already in hand.
    const workshopCollected = workshopRevenue
      .filter((job) => job.status === "PAID")
      .reduce((sum, job) => sum + (job.totalPartsCost || 0), 0);
    const workshopAwaiting = workshopRevenue
      .filter((job) => job.status === "COMPLETED")
      .reduce((sum, job) => sum + (job.totalPartsCost || 0), 0);

    // FUEL STATION: sales never touch POS, so this whole income stream was
    // missing. Cash counts once finance has approved the shift handover, and
    // we use the counted (declared) amount so a shortfall is not hidden.
    const fuelCashCleared = handovers
      .filter((h) => h.status === "APPROVED")
      .reduce((sum, h) => sum + (h.declaredCash || 0), 0);

    const settledRmaRev = rmas.filter((r) => r.financialStatus === "SETTLED").reduce((sum, r) => sum + (r.totalValue || 0), 0);
    const unsettledList = rmas.filter((r) => r.financialStatus === "UNSETTLED");
    const unsettledTotal = unsettledList.reduce((sum, r) => sum + (r.totalValue || 0), 0);
    const income = roundMoney(posRev + workshopCollected + settledRmaRev + fuelCashCleared);

    // Supplier payments already made (not the remaining balance — that's a
    // liability, not cash that's left the account) plus payroll already
    // disbursed, both subtracted from revenue. Payroll has no partial-payment
    // concept, so every salary record represents cash that's already gone.
    //
    // KNOWN LIMITATION: an RMA credit settled by "offset" is recorded as a
    // supplier payment (outflow) AND as a settled RMA (inflow) with no cash
    // actually moving — the two cancel, so Net Cash Position stays right, but
    // both gross figures are inflated by the offset amount. Fixing that needs
    // the backend to store the settlement method on the RMA record.
    const paidToSuppliers = invoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);
    const payrollPaid = salaries.reduce((sum, rec) => sum + (rec.totalSalary ?? rec.netSalary ?? 0), 0);
    const netPosition = roundMoney(income - paidToSuppliers - payrollPaid);

    let status = "CLEARED"; let healthy = true;
    if (overdue > 0) { status = "OVERDUE"; healthy = false; }
    else if (pending > 0) { status = "PENDING"; healthy = true; }

    return {
      totalDebt: debt, pendingCount: pending, overdueCount: overdue, upcomingDue: upcoming,
      totalIncome: income, totalPayrollPaid: payrollPaid, totalPaidToSuppliers: paidToSuppliers, netCashPosition: netPosition,
      workshopCollected, workshopAwaiting, fuelCashCleared,
      unsettledRmaCount: unsettledList.length, unsettledRmaTotal: unsettledTotal,
      ledgerStatus: status, isLedgerHealthy: healthy,
    };
  }, [invoices, retailRevenue, workshopRevenue, rmas, salaries, handovers]);

  const filteredInvoices = useMemo(() => {
    const q = payablesSearch.trim().toLowerCase();
    return invoices.filter((inv) => {
      const { balance, status } = getInvoiceStatus(inv);
      const matchesFilter =
        payablesFilter === "ALL" ? true :
        payablesFilter === "PAID" ? status === "PAID" :
        payablesFilter === "OVERDUE" ? status === "OVERDUE" :
        balance > MONEY_EPSILON; // OUTSTANDING
      const matchesSearch = !q || inv.supplierName.toLowerCase().includes(q) || inv.supplyCategory.toLowerCase().includes(q) || String(inv.invoiceId).includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [invoices, payablesFilter, payablesSearch]);
  const invoicesPagination = usePagination(filteredInvoices, 8);

  const filteredRmas = useMemo(() => {
    const q = rmaSearch.trim().toLowerCase();
    if (!q) return rmas;
    return rmas.filter((r) => r.supplierName.toLowerCase().includes(q) || r.partName.toLowerCase().includes(q) || r.partCode.toLowerCase().includes(q));
  }, [rmas, rmaSearch]);
  const rmasPagination = usePagination(filteredRmas, 8);

  const filteredWorkshop = useMemo(() => {
    const q = workshopSearch.trim().toLowerCase();
    if (!q) return workshopRevenue;
    return workshopRevenue.filter((j) => j.vehicleRegNo.toLowerCase().includes(q) || String(j.bookingID).includes(q));
  }, [workshopRevenue, workshopSearch]);
  const workshopPagination = usePagination(filteredWorkshop, 8);

  const filteredRetail = useMemo(() => {
    const q = retailSearch.trim().toLowerCase();
    if (!q) return retailRevenue;
    return retailRevenue.filter((t) => t.itemsSummary?.toLowerCase().includes(q) || String(t.transactionId).includes(q));
  }, [retailRevenue, retailSearch]);
  const retailPagination = usePagination(filteredRetail, 8);

  // All-time totals for the Revenue tab's summary cards — independent of the
  // search box, so the headline numbers don't shift while someone is typing.
  const retailRevenueTotal = useMemo(() => retailRevenue.reduce((s, t) => s + (t.totalRevenue || 0), 0), [retailRevenue]);

  // ---------------------------------------------------------------------------
  // LOADING SKELETON
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12" aria-busy="true" aria-label="Loading payables ledger">
        <div className="max-w-[1400px] mx-auto space-y-8">
          <div className="h-16 bg-slate-200 rounded-2xl animate-pulse w-1/2" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-slate-200 rounded-3xl animate-pulse" />)}
          </div>
          <div className="h-96 bg-slate-200 rounded-3xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12 relative">
      <div className="max-w-[1400px] mx-auto">

        {/* --- FETCH ERROR BANNER --- */}
        {Object.keys(fetchErrors).length > 0 && (
          <div className="flex items-center justify-between gap-4 px-6 py-4 bg-red-50 border border-red-200 rounded-2xl mb-6">
            <div className="flex items-center gap-3">
              <IconAlertTriangle c="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm font-bold text-red-700">Couldn't load: {Object.keys(fetchErrors).join(", ")}. Figures below may be incomplete.</p>
            </div>
            <button onClick={() => fetchAll(true)} className="text-xs font-black uppercase tracking-widest text-red-700 hover:text-red-900 whitespace-nowrap">Retry now</button>
          </div>
        )}

        {/* --- HEADER --- */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Master Ledger & Financial Control</h1>
            <p className="text-slate-500 font-medium mt-2">Manage supplier payables, credit note offsets, and inbound workshop revenues.</p>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={() => fetchAll(true)} disabled={refreshing} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg text-xs font-bold text-slate-600 transition-colors">
                <IconRefresh c={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              {lastUpdated && <span className="text-[11px] text-slate-400 font-semibold">Updated {lastUpdated.toLocaleTimeString()}</span>}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => exportPayablesCSV(invoices)} disabled={invoices.length === 0}
              className="inline-flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-bold rounded-xl shadow-sm transition-all text-sm">
              <IconDownload c="w-4 h-4" /> Export CSV
            </button>
            <button onClick={() => setIsFormOpen(true)} className="px-6 py-3 bg-slate-900 text-white hover:bg-blue-600 font-bold rounded-xl shadow-lg transition-all text-sm flex items-center gap-2">
              + Log Utility/Fuel Bill
            </button>
          </div>
        </div>

        {/* --- SMART ACTION CENTER BANNER --- */}
        {(overdueCount > 0 || unsettledRmaCount > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {overdueCount > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <div>
                    <h4 className="font-black text-red-900 text-sm">Critical: {overdueCount} Overdue Invoice(s)</h4>
                    <p className="text-xs text-red-700">Immediate supplier disbursement required.</p>
                  </div>
                </div>
                <button onClick={() => { setActiveTab("PAYABLES"); setPayablesFilter("OVERDUE"); }} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700">View Overdue</button>
              </div>
            )}
            {unsettledRmaCount > 0 && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <h4 className="font-black text-emerald-900 text-sm">{unsettledRmaCount} Approved RMA Credit(s) Ready</h4>
                    <p className="text-xs text-emerald-700">{formatLKR(unsettledRmaTotal)} ready for cash recovery or invoice offset.</p>
                  </div>
                </div>
                <button onClick={() => setActiveTab("RMA_CREDITS")} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">Review Credits</button>
              </div>
            )}
          </div>
        )}

        {/* --- KPI SUMMARY METRICS --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <StatCard title="Total Cash Inflow" value={formatCompactLKR(totalIncome)} exactValue={formatLKR(totalIncome)} trend="Paid jobs, Retail, Fuel & RMA" trendUp={true} delay="0.1s" />
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Net Cash Position</h3>
            <div className={`text-2xl lg:text-3xl font-black tracking-tight mb-3 ${netCashPosition < 0 ? "text-red-600" : "text-slate-900"}`} title={formatLKR(netCashPosition)}>{formatCompactLKR(netCashPosition)}</div>
            <div className="text-xs font-bold text-slate-500">Inflow &minus; supplier &amp; payroll payouts</div>
          </div>
          <StatCard title="Total Supplier Debt" value={formatCompactLKR(totalDebt)} exactValue={formatLKR(totalDebt)} trend={`${pendingCount} Active Invoices`} trendUp={totalDebt === 0} delay="0.2s" />
          <StatCard title="Due In 7 Days" value={formatCompactLKR(upcomingDue)} exactValue={formatLKR(upcomingDue)} trend={upcomingDue > 0 ? "Requires Attention" : "Clear for 7 Days"} trendUp={upcomingDue === 0} delay="0.3s" />
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Ledger Health</h3>
            <div className={`text-2xl lg:text-3xl font-black tracking-tight mb-2 ${isLedgerHealthy ? "text-emerald-600" : "text-red-600 animate-pulse"}`}>{ledgerStatus}</div>
            <div className="text-xs font-bold text-slate-500">{overdueCount > 0 ? `${overdueCount} bills past deadline` : "Operating normally"}</div>
          </div>
        </div>
        <p className="text-xs font-semibold text-slate-400 -mt-4 mb-8">
          Net cash position = {formatLKR(totalIncome)} received &minus; {formatLKR(totalPaidToSuppliers)} paid to suppliers &minus; {formatLKR(totalPayrollPaid)} payroll.
          {workshopAwaiting > 0 && <> {formatLKR(workshopAwaiting)} in completed jobs is still awaiting customer payment and is not counted.</>}
        </p>

        {/* --- TAB NAVIGATION --- */}
        <div className="flex border-b border-slate-200 mb-8 gap-4">
          <button onClick={() => setActiveTab("PAYABLES")} className={`pb-4 px-2 font-black text-sm uppercase tracking-wider transition-all ${activeTab === "PAYABLES" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-400 hover:text-slate-700"}`}>
            Supplier Payables & Debt ({pendingCount})
          </button>
          <button onClick={() => setActiveTab("RMA_CREDITS")} className={`pb-4 px-2 font-black text-sm uppercase tracking-wider transition-all relative ${activeTab === "RMA_CREDITS" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-400 hover:text-slate-700"}`}>
            Supplier Credits & RMA ({rmas.length})
            {unsettledRmaCount > 0 && <span className="ml-2 px-2 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 rounded-full font-bold">{unsettledRmaCount} Action</span>}
          </button>
          <button onClick={() => setActiveTab("REVENUE")} className={`pb-4 px-2 font-black text-sm uppercase tracking-wider transition-all ${activeTab === "REVENUE" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-400 hover:text-slate-700"}`}>
            Inbound Revenue Streams
          </button>
        </div>

        {/* --- TAB 1: SUPPLIER DEBT & INVOICES --- */}
        {activeTab === "PAYABLES" && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in-up">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row justify-between lg:items-center gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Accounts Payable Ledger</h3>
                <p className="text-xs font-medium text-slate-500 mt-1">Verified supplier bills, purchase order liabilities, and payment fulfillment.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SearchInput value={payablesSearch} onChange={setPayablesSearch} placeholder="Search supplier or invoice #..." ariaLabel="Search invoices" className="w-56" />
                <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                  {(["OUTSTANDING", "OVERDUE", "PAID", "ALL"] as PayablesFilter[]).map((f) => (
                    <button key={f} onClick={() => setPayablesFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${payablesFilter === f ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-white border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th scope="col" className="px-6 py-4">#</th>
                    <th scope="col" className="px-6 py-4">Supplier & Category</th>
                    <th scope="col" className="px-6 py-4">Due Date</th>
                    <th scope="col" className="px-6 py-4 text-right">Invoice Total</th>
                    <th scope="col" className="px-6 py-4 text-right">Balance Due</th>
                    <th scope="col" className="px-6 py-4 text-center">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Disbursement</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                  {invoicesPagination.pageItems.map((inv) => {
                    const { balance, isOverdue, status: displayStatus, isOverpaid, overpaidAmount } = getInvoiceStatus(inv);
                    const isPending = pendingPaymentIds.has(inv.invoiceId);
                    return (
                      <tr key={inv.invoiceId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-5 font-black text-slate-400">{inv.invoiceId}</td>
                        <td className="px-6 py-5">
                          <div className="font-bold text-slate-900">{inv.supplierName}</div>
                          <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">{inv.supplyCategory.replace("_", " ")}</div>
                        </td>
                        <td className="px-6 py-5"><span className={`font-mono text-xs ${isOverdue ? "text-red-600 font-bold" : "text-slate-600"}`}>{inv.dueDate}</span></td>
                        <td className="px-6 py-5 text-right font-mono text-slate-500">{formatLKR(inv.totalInvoiceAmount)}</td>
                        <td className="px-6 py-5 text-right font-mono font-black text-slate-900 text-base">
                          {formatLKR(balance)}
                          {isOverpaid && (
                            <div className="flex justify-end mt-1">
                              <span title="Amount paid exceeds the invoice total — needs review." className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200 text-[9px] font-black uppercase tracking-wider">
                                <IconAlertTriangle c="w-2.5 h-2.5" /> Overpaid {formatLKR(overpaidAmount)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded border ${
                            displayStatus === "OVERDUE" ? "bg-red-50 text-red-600 border-red-200" :
                            displayStatus === "PARTIAL" ? "bg-yellow-50 text-yellow-600 border-yellow-200" :
                            displayStatus === "PAID" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}>
                            {displayStatus}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex justify-end gap-2 items-center">
                            {inv.paymentHistory?.length > 0 && (
                              <button onClick={() => setHistoryModal(inv)} className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 mr-1" aria-label={`View payment history for ${inv.supplierName}`}>
                                <IconClock c="w-3 h-3" /> History
                              </button>
                            )}
                            {balance > MONEY_EPSILON ? (
                              <>
                                <input
                                  type="number" step="0.01" min="0" placeholder="Rs." disabled={isPending}
                                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 w-24 text-right disabled:opacity-60"
                                  value={paymentInputs[inv.invoiceId] || ""}
                                  onChange={(e) => setPaymentInputs({ ...paymentInputs, [inv.invoiceId]: e.target.value })}
                                  aria-label={`Payment amount for invoice ${inv.invoiceId}`}
                                />
                                <button onClick={() => handlePayment(inv.invoiceId, balance)} disabled={isPending}
                                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-blue-600 disabled:opacity-60 text-white font-bold rounded-lg shadow-sm text-[10px] uppercase tracking-wider transition-all">
                                  {isPending ? "Processing..." : "Pay"}
                                </button>
                              </>
                            ) : (
                              <span className="text-xs font-bold text-emerald-600 pr-2">Settled</span>
                            )}
                            <button onClick={() => handleDeleteClick(inv)} disabled={isPending} className="p-1.5 text-slate-300 hover:text-red-500 disabled:opacity-40 rounded" title="Void Bill" aria-label={`Delete invoice for ${inv.supplierName}`}>
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {invoicesPagination.pageItems.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      {payablesSearch || payablesFilter !== "ALL" ? "No invoices match your filters." : "No payables found in the ledger."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar pagination={invoicesPagination} itemLabel="invoices" />
          </div>
        )}

        {/* --- TAB 2: RMA CREDITS & OFFSETTING --- */}
        {activeTab === "RMA_CREDITS" && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in-up">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row justify-between lg:items-center gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Supplier Credit Notes & Warranty Recoveries</h3>
                <p className="text-xs font-medium text-slate-500 mt-1">Offset approved RMA claims against active invoices or collect direct cash deposits.</p>
              </div>
              <div className="relative">
                <SearchInput value={rmaSearch} onChange={setRmaSearch} placeholder="Search supplier or part..." ariaLabel="Search RMA credits" className="w-56" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-white border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th scope="col" className="px-6 py-4">RMA Ref</th>
                    <th scope="col" className="px-6 py-4">Supplier</th>
                    <th scope="col" className="px-6 py-4">Defective Component</th>
                    <th scope="col" className="px-6 py-4 text-right">Credit Value</th>
                    <th scope="col" className="px-6 py-4 text-center">Settlement Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Financial Action</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                  {rmasPagination.pageItems.map((rma) => (
                    <tr key={rma.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5 font-mono text-xs text-slate-500 font-bold">RMA-{rma.id.toString().padStart(4, "0")}</td>
                      <td className="px-6 py-5 font-bold text-slate-900">{rma.supplierName}</td>
                      <td className="px-6 py-5">
                        <div className="font-bold text-slate-900">{rma.partName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{rma.partCode} • Qty {rma.quantity}</div>
                      </td>
                      <td className="px-6 py-5 text-right font-black text-emerald-600 text-base">+{formatLKR(rma.totalValue)}</td>
                      <td className="px-6 py-5 text-center">
                        <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded border ${rma.financialStatus === "SETTLED" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-yellow-50 text-yellow-600 border-yellow-200"}`}>
                          {rma.financialStatus}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        {rma.financialStatus === "UNSETTLED" ? (
                          <button onClick={() => openSettlementModal(rma)} className="px-4 py-2 bg-slate-900 hover:bg-emerald-600 text-white font-bold rounded-lg shadow-sm text-xs uppercase tracking-wider transition-all active:scale-95">
                            Process Credit Note &rarr;
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-emerald-600 flex items-center justify-end gap-1.5 pr-2"><IconCheckCircle c="w-4 h-4" /> Reconciled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rmasPagination.pageItems.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      {rmaSearch ? "No credits match your search." : "No approved supplier warranty claims awaiting financial settlement."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar pagination={rmasPagination} itemLabel="credits" />
          </div>
        )}

        {/* --- TAB 3: INBOUND REVENUE STREAMS --- */}
        {activeTab === "REVENUE" && (
          <div className="animate-fade-in-up space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Workshop Collected" value={formatCompactLKR(workshopCollected)} exactValue={formatLKR(workshopCollected)} trend="Jobs paid by customers" trendUp={true} delay="0s" />
              <StatCard title="Awaiting Payment" value={formatCompactLKR(workshopAwaiting)} exactValue={formatLKR(workshopAwaiting)} trend={workshopAwaiting > 0 ? "Invoiced, not yet collected" : "Nothing outstanding"} trendUp={workshopAwaiting === 0} delay="0.05s" />
              <StatCard title="Retail Revenue" value={formatCompactLKR(retailRevenueTotal)} exactValue={formatLKR(retailRevenueTotal)} trend={`${retailRevenue.length} transactions`} trendUp={true} delay="0.1s" />
              <StatCard title="Fuel Station Cash" value={formatCompactLKR(fuelCashCleared)} exactValue={formatLKR(fuelCashCleared)} trend="Approved shift handovers" trendUp={true} delay="0.15s" />
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0"><IconWrench c="w-4 h-4" /></span>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Workshop Billed Job Cards</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Labor + parts revenue realized on completion.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <SearchInput value={workshopSearch} onChange={setWorkshopSearch} placeholder="Plate or job #..." ariaLabel="Search workshop jobs" className="w-36" dense />
                    <button onClick={() => exportWorkshopCSV(filteredWorkshop)} disabled={filteredWorkshop.length === 0}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-600 font-bold rounded-lg text-[11px] transition-colors flex-shrink-0">
                      <IconDownload c="w-3 h-3" /> CSV
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead className="sticky top-0 bg-white shadow-sm z-10">
                      <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-400 font-black">
                        <th scope="col" className="px-6 py-4">Job Reference</th>
                        <th scope="col" className="px-6 py-4">Vehicle Plate</th>
                        <th scope="col" className="px-6 py-4 text-center">Payment</th>
                        <th scope="col" className="px-6 py-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                      {workshopPagination.pageItems.map((job) => {
                        const isCollected = job.status === "PAID";
                        return (
                          <tr key={job.bookingID} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 font-mono text-xs text-slate-500">JOB-{job.bookingID}</td>
                            <td className="px-6 py-4 font-bold text-slate-900 font-mono tracking-wide">{(job.vehicleRegNo || "").toUpperCase()}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-2 py-1 text-[9px] font-black uppercase tracking-wider rounded border ${isCollected ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-amber-50 text-amber-600 border-amber-200"}`}>
                                {isCollected ? "Collected" : "Awaiting"}
                              </span>
                            </td>
                            <td className={`px-6 py-4 text-right font-black text-base ${isCollected ? "text-emerald-600" : "text-amber-600"}`}>+{formatLKR(job.totalPartsCost || 0)}</td>
                          </tr>
                        );
                      })}
                      {workshopPagination.pageItems.length === 0 && (
                        <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">{workshopSearch ? "No jobs match your search." : "No completed jobs found."}</td></tr>
                      )}
                    </tbody>
                    {filteredWorkshop.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-slate-100 bg-slate-50/70">
                          <td colSpan={3} className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {workshopSearch ? `Subtotal (${filteredWorkshop.length} matching)` : "Subtotal"}
                          </td>
                          <td className="px-6 py-3 text-right font-black text-slate-900">{formatLKR(filteredWorkshop.reduce((s, j) => s + (j.totalPartsCost || 0), 0))}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <PaginationBar pagination={workshopPagination} itemLabel="jobs" />
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><IconShoppingBag c="w-4 h-4" /></span>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Over-The-Counter Retail Sales</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Direct point-of-sale customer purchases.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <SearchInput value={retailSearch} onChange={setRetailSearch} placeholder="Receipt or item..." ariaLabel="Search retail sales" className="w-36" dense />
                    <button onClick={() => exportRetailCSV(filteredRetail)} disabled={filteredRetail.length === 0}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-600 font-bold rounded-lg text-[11px] transition-colors flex-shrink-0">
                      <IconDownload c="w-3 h-3" /> CSV
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead className="sticky top-0 bg-white shadow-sm z-10">
                      <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-400 font-black">
                        <th scope="col" className="px-6 py-4">Receipt Ref</th>
                        <th scope="col" className="px-6 py-4">Summary</th>
                        <th scope="col" className="px-6 py-4 text-right">Cash Received</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                      {retailPagination.pageItems.map((txn) => (
                        <tr key={txn.transactionId} className="hover:bg-slate-50/50">
                          <td className="px-6 py-4 font-mono text-xs text-slate-500">TXN-{txn.transactionId}</td>
                          <td className="px-6 py-4 text-xs text-slate-600 truncate max-w-[200px]">{txn.itemsSummary}</td>
                          <td className="px-6 py-4 text-right font-black text-emerald-600 text-base">+{formatLKR(txn.totalRevenue)}</td>
                        </tr>
                      ))}
                      {retailPagination.pageItems.length === 0 && (
                        <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400">{retailSearch ? "No transactions match your search." : "No retail counter transactions logged."}</td></tr>
                      )}
                    </tbody>
                    {filteredRetail.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-slate-100 bg-slate-50/70">
                          <td colSpan={2} className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {retailSearch ? `Subtotal (${filteredRetail.length} matching)` : "Subtotal"}
                          </td>
                          <td className="px-6 py-3 text-right font-black text-slate-900">{formatLKR(filteredRetail.reduce((s, t) => s + (t.totalRevenue || 0), 0))}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <PaginationBar pagination={retailPagination} itemLabel="transactions" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- ALL OVERLAYS BELOW ARE PORTALED TO <body> --- */}
      {/* Fixed-position overlays can get trapped by a transform/filter on any
          ancestor layout wrapper, which silently breaks `position: fixed`. */}
      {portalTarget && createPortal(
        <>
          {/* TOASTS */}
          <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 w-80 max-w-[90vw]" role="status" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold ${
                t.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
                t.type === "error" ? "bg-red-50 border-red-200 text-red-800" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}>
                {t.type === "success" ? <IconCheckCircle c="w-5 h-5 flex-shrink-0 mt-0.5" /> : t.type === "error" ? <IconAlertTriangle c="w-5 h-5 flex-shrink-0 mt-0.5" /> : <IconInfo c="w-5 h-5 flex-shrink-0 mt-0.5" />}
                <span className="flex-1">{t.message}</span>
                <button onClick={() => dismissToast(t.id)} aria-label="Dismiss notification" className="text-current opacity-60 hover:opacity-100"><IconXCircle c="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          {/* GENERIC CONFIRM MODAL (delete + full-settlement confirm) */}
          {confirmState.isOpen && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title"
              onKeyDown={(e) => { if (e.key === "Escape" && !confirmState.pending) setConfirmState(CLOSED_CONFIRM); }}>
              <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-sm w-full border border-slate-200 text-center">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto ${confirmState.tone === "danger" ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"}`}>
                  {confirmState.tone === "danger" ? <IconAlertTriangle c="w-6 h-6" /> : <IconCheckCircle c="w-6 h-6" />}
                </div>
                <h3 id="confirm-title" className="text-xl font-bold text-slate-900 mb-2">{confirmState.title}</h3>
                <p className="text-slate-500 text-sm mb-6 font-medium">{confirmState.message}</p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmState(CLOSED_CONFIRM)} disabled={confirmState.pending} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-60">Cancel</button>
                  <button onClick={confirmState.onConfirm} disabled={confirmState.pending}
                    className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-white shadow-md disabled:opacity-60 ${confirmState.tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-blue-600"}`}>
                    {confirmState.pending ? "Processing..." : confirmState.confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ADD UTILITY/FUEL INVOICE MODAL */}
          {isFormOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="add-invoice-title">
              <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-2xl w-full">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 id="add-invoice-title" className="text-xl font-black text-slate-900">Log External Operational Bill</h2>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">For manual fuel refills, utilities, and facility maintenance debts.</p>
                  </div>
                  <button onClick={() => setIsFormOpen(false)} aria-label="Close" className="text-slate-400 font-bold hover:text-red-500 text-xl">✕</button>
                </div>
                <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="supplierName" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Vendor / Utility Name</label>
                    <input id="supplierName" {...register("supplierName")} type="text" placeholder="e.g., Ceypetco Bulk Fuel" className={`w-full px-4 py-3 rounded-xl border bg-slate-50 outline-none transition-all ${errors.supplierName ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                    {errors.supplierName && <p className="mt-1 text-xs font-bold text-red-500">{errors.supplierName.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="supplyCategory" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Category</label>
                    <select id="supplyCategory" {...register("supplyCategory")} className="w-full px-4 py-3 rounded-xl border bg-slate-50 outline-none transition-all cursor-pointer border-slate-200 focus:border-blue-500">
                      <option value="FUEL">Fuel Station Stock</option>
                      <option value="EQUIPMENT">Workshop Equipment</option>
                      <option value="MAINTENANCE">Facility Maintenance</option>
                      <option value="SPARE_PARTS" disabled className="text-slate-300">Spare Parts (Auto-Generated via Procurement)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="totalInvoiceAmount" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Billed Amount (Rs.)</label>
                    <input id="totalInvoiceAmount" {...register("totalInvoiceAmount")} type="number" step="0.01" min="0.01" placeholder="0.00" className={`w-full px-4 py-3 rounded-xl border bg-slate-50 outline-none transition-all ${errors.totalInvoiceAmount ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                    {errors.totalInvoiceAmount && <p className="mt-1 text-xs font-bold text-red-500">{errors.totalInvoiceAmount.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="dueDate" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Payment Deadline</label>
                    <input id="dueDate" {...register("dueDate")} type="date" min={new Date().toISOString().slice(0, 10)} className={`w-full px-4 py-3 rounded-xl border bg-slate-50 outline-none transition-all ${errors.dueDate ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                    {errors.dueDate && <p className="mt-1 text-xs font-bold text-red-500">{errors.dueDate.message}</p>}
                  </div>
                  <div className="col-span-2 mt-4 flex justify-end items-center">
                    <button type="submit" disabled={isSubmitting} className="px-8 py-4 bg-slate-900 text-white font-black rounded-xl hover:bg-blue-600 disabled:opacity-60 transition-all uppercase tracking-widest text-xs">
                      {isSubmitting ? "Registering..." : "Add to Liabilities"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* PAYMENT HISTORY MODAL — now reachable for PAID invoices too, since they no longer disappear from the ledger */}
          {historyModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="history-title"
              onKeyDown={(e) => { if (e.key === "Escape") setHistoryModal(null); }}>
              <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full border border-slate-200">
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                  <div>
                    <h3 id="history-title" className="text-lg font-black text-slate-900">Disbursement Ledger</h3>
                    <p className="text-xs font-bold text-slate-500 mt-1">{historyModal.supplierName} • {historyModal.supplyCategory.replace("_", " ")}</p>
                  </div>
                  <button onClick={() => setHistoryModal(null)} aria-label="Close" className="text-slate-400 font-bold hover:text-red-500 text-xl">✕</button>
                </div>
                <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                  {historyModal.paymentHistory.map((record, i) => (
                    <div key={i} className="flex justify-between items-center p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                      <div>
                        <span className="block font-black text-emerald-800 text-lg">{formatLKR(record.amountPaid)}</span>
                        <span className="text-[10px] font-bold text-emerald-600/70">{new Date(record.paymentDate).toLocaleString()}</span>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-white border border-emerald-100 px-3 py-1.5 rounded-lg shadow-sm">By {record.processedBy}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CREDIT NOTE / OFFSET MODAL */}
          {settlementModal.isOpen && settlementModal.rma && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="settlement-title">
              <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-lg w-full border border-slate-200">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 id="settlement-title" className="text-xl font-black text-slate-900">Process Credit Settlement</h3>
                    <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">RMA-{settlementModal.rma.id} • {settlementModal.rma.supplierName}</p>
                  </div>
                  <button onClick={() => setSettlementModal({ ...settlementModal, isOpen: false })} disabled={settlementPending} aria-label="Close" className="p-2 text-slate-400 hover:text-slate-700 rounded-full disabled:opacity-50">✕</button>
                </div>

                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl mb-6 flex justify-between items-center">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest">Authorized Refund Value:</span>
                  <span className="font-black text-2xl text-emerald-700">{formatLKR(settlementModal.rma.totalValue)}</span>
                </div>

                <div className="space-y-4 mb-6">
                  <label className="block text-xs font-black text-slate-600 uppercase tracking-widest">Select Recovery Method</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" disabled={settlementPending} onClick={() => setSettlementModal({ ...settlementModal, method: "OFFSET" })}
                      className={`p-4 rounded-xl border text-left font-bold transition-all disabled:opacity-60 ${settlementModal.method === "OFFSET" ? "border-slate-900 bg-slate-900 text-white shadow-md" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>
                      <span className="block text-sm">Offset Invoice</span>
                      <span className="text-[10px] font-normal opacity-80 mt-1 block">Deduct directly from active debt</span>
                    </button>
                    <button type="button" disabled={settlementPending} onClick={() => setSettlementModal({ ...settlementModal, method: "CASH" })}
                      className={`p-4 rounded-xl border text-left font-bold transition-all disabled:opacity-60 ${settlementModal.method === "CASH" ? "border-slate-900 bg-slate-900 text-white shadow-md" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>
                      <span className="block text-sm">Direct Deposit</span>
                      <span className="text-[10px] font-normal opacity-80 mt-1 block">Received as bank transfer/cash</span>
                    </button>
                  </div>

                  {settlementModal.method === "OFFSET" && (
                    <div className="pt-2">
                      <label htmlFor="targetInvoice" className="block text-xs font-black text-slate-600 uppercase tracking-widest mb-2">Target Active Invoice</label>
                      <select id="targetInvoice" disabled={settlementPending} value={settlementModal.targetInvoiceId || ""}
                        onChange={(e) => setSettlementModal({ ...settlementModal, targetInvoiceId: parseInt(e.target.value) || null })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 disabled:opacity-60">
                        <option value="">-- Select Active Bill to Deduct From --</option>
                        {invoices
                          .filter((inv) => settlementModal.rma != null && sameSupplier(inv, settlementModal.rma) && getInvoiceStatus(inv).balance > MONEY_EPSILON)
                          .map((inv) => {
                            const { balance } = getInvoiceStatus(inv);
                            return <option key={inv.invoiceId} value={inv.invoiceId}>Invoice #{inv.invoiceId} (Due: {inv.dueDate}) — Remaining Balance: {formatLKR(balance)}</option>;
                          })}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button type="button" disabled={settlementPending} onClick={() => setSettlementModal({ ...settlementModal, isOpen: false })} className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 transition-colors">Cancel</button>
                  <button type="button" disabled={settlementPending} onClick={executeSettlement} className="flex-1 py-3 px-4 rounded-xl font-black text-white bg-slate-900 hover:bg-emerald-600 disabled:opacity-60 shadow-md transition-all active:scale-95 text-xs uppercase tracking-widest">
                    {settlementPending ? "Processing..." : "Confirm Settlement"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>,
        portalTarget
      )}

      <style dangerouslySetInnerHTML={{ __html: `@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in-up { animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }` }} />
    </div>
  );
}

function StatCard({ title, value, exactValue, trend, trendUp, delay }: { title: string; value: string; exactValue?: string; trend: string; trendUp: boolean; delay: string }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: delay }}>
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</h3>
      <div className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight mb-3" title={exactValue || value}>{value}</div>
      <div className={`text-xs font-bold flex items-center gap-1.5 ${trendUp ? "text-emerald-600" : "text-red-500"}`}>
        {!trendUp ? <IconAlertTriangle c="w-4 h-4" /> : <IconCheckCircle c="w-4 h-4" />}
        {trend}
      </div>
    </div>
  );
}
