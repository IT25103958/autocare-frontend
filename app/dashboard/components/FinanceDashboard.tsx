"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import FinanceAlerts from "./FinanceAlerts";
import FundsPosition from "./FundsPosition";
import DailyBrief from "./DailyBrief";
import api from "../../../utils/axiosInstance";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
  LineChart, Line,
} from "recharts";

// =============================================================================
// TYPES
// Real interfaces instead of `any` — catches backend shape drift at compile time.
// =============================================================================
interface Booking {
  id: number;
  status: string;
  totalPartsCost?: number;
}

interface POSRecord {
  id: number;
  totalRevenue?: number;
}

interface Payable {
  id: number;
  totalInvoiceAmount?: number;
  amountPaid?: number;
  supplyCategory?: string;
  status?: string;
}

interface RmaCredit {
  id: number;
  totalValue?: number;
  status?: string;
  financialStatus?: string;
}

interface SalaryRecord {
  salaryId: number;
  totalSalary?: number;
  netSalary?: number;
}

interface PricingRule {
  id: number;
  ruleName: string;
  ruleType: "TAX" | "DISCOUNT" | string;
  percentage: number;
  active?: boolean;
  isActive?: boolean;
}

interface ShiftHandover {
  id: number;
  pumpNumber: number;
  attendantUsername: string;
  supervisorUsername: string;
  shiftStartedAt: string;
  shiftEndedAt: string;
  expectedCash: number;
  declaredCash: number;
  variance: number;
  // NEEDS_COUNT | PENDING_AUDIT | APPROVED | REJECTED (SYSTEM_FORCE_CLOSED on old rows)
  status: string;
  // Card/QR takings in the shift — settled by the bank, not in the drawer.
  nonCashSales?: number | null;
  meterLiters?: number | null;
  recordedLiters?: number | null;
  literVariance?: number | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
}

// Must match autocare.fuel.* in the backend's application.properties.
const HANDOVER_CASH_TOLERANCE = 100;
const HANDOVER_METER_TOLERANCE_L = 1;

function handoverNeedsNote(h: ShiftHandover) {
  return Math.abs(h.variance) > HANDOVER_CASH_TOLERANCE
    || (h.literVariance != null && Math.abs(h.literVariance) > HANDOVER_METER_TOLERANCE_L);
}

interface FetchErrors {
  bookings?: boolean;
  pos?: boolean;
  payables?: boolean;
  rma?: boolean;
  salary?: boolean;
  rules?: boolean;
  handovers?: boolean;
  intraday?: boolean;
}

interface IntradayPoint {
  hour: number;
  amount: number;
}

type ToastType = "success" | "error" | "info";
interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

// =============================================================================
// SMALL, DEPENDENCY-FREE ICON SET
// Kept inline so this file has zero new npm installs to worry about.
// =============================================================================
const iconStroke = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };

function IconRefresh({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
function IconAlertTriangle({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM10.29 3.86l-8.18 14.16A1.5 1.5 0 003.5 20.5h17a1.5 1.5 0 001.39-2.48L13.71 3.86a1.5 1.5 0 00-2.42 0z" />
    </svg>
  );
}
function IconCheckCircle({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M9 12.75l1.5 1.5 3.75-4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconXCircle({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconTrash({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
function IconSearch({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M21 21l-4.35-4.35m1.6-5.4a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}
function IconDownload({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3" />
    </svg>
  );
}
function IconInfo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M11.25 11.25h.75v4.5h.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zM12 8.25h.008v.008H12V8.25z" />
    </svg>
  );
}
function IconChevronLeft({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}
function IconChevronRight({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
function IconWallet({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M21 12v5.25A2.25 2.25 0 0118.75 19.5H5.25A2.25 2.25 0 013 17.25V6.75A2.25 2.25 0 015.25 4.5h9M21 12a2.25 2.25 0 00-2.25-2.25H15a2.25 2.25 0 000 4.5h3.75A2.25 2.25 0 0021 12z" />
    </svg>
  );
}
function IconClock({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconFileText({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path {...iconStroke} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5A3.375 3.375 0 0010.125 2.25H8.25m5.231 13.481L15 14.25m-3.75 3.75l1.5-1.5m0 0l1.5 1.5m-1.5-1.5V21M8.25 2.25H4.5v19.5h15V9.75z" />
    </svg>
  );
}

// =============================================================================
// SMALL REUSABLE HOOK: client-side pagination for a filtered list
// =============================================================================
function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pageItems = useMemo(
    () => items.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [items, clampedPage, pageSize]
  );

  return { page: clampedPage, setPage, totalPages, pageItems };
}

// Renders children into document.body instead of wherever this component
// happens to sit in the tree. Without this, a `position: fixed` toast or
// modal can get silently trapped by a `transform`/`filter`/`will-change` on
// ANY ancestor (common with page-transition wrappers, sticky layouts, etc.)
// — the browser then treats "fixed" as relative to that ancestor instead of
// the viewport, which is why toasts can end up pinned in the wrong corner.
function usePortalTarget() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.body);
  }, []);
  return target;
}

function exportHandoversCSV(rows: ShiftHandover[]) {
  const headers = ["Pump", "Attendant", "Supervisor", "Expected Cash", "Declared Cash", "Variance", "Meter Liters", "POS Liters", "Liter Variance", "Status", "Reviewed By", "Review Note"];
  const body = rows.map((h) => [
    h.pumpNumber, h.attendantUsername, h.supervisorUsername, h.expectedCash, h.declaredCash, h.variance,
    h.meterLiters ?? "", h.recordedLiters ?? "", h.literVariance ?? "", h.status, h.reviewedBy ?? "", h.reviewNote ?? "",
  ]);
  const csv = [headers, ...body]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `shift-handovers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// =============================================================================
// COMPONENT
// =============================================================================
export default function FinanceDashboard({ userName }: { userName?: string }) {
  const [data, setData] = useState<{ bookings: Booking[]; pos: POSRecord[]; payables: Payable[]; rma: RmaCredit[]; salary: SalaryRecord[] }>({
    bookings: [], pos: [], payables: [], rma: [], salary: [],
  });
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);
  const [intraday, setIntraday] = useState<IntradayPoint[]>([]);
  const [newRule, setNewRule] = useState({ ruleName: "", ruleType: "TAX", percentage: 0 });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchErrors, setFetchErrors] = useState<FetchErrors>({});

  const [savingRule, setSavingRule] = useState(false);
  const [pendingRuleIds, setPendingRuleIds] = useState<Set<number>>(new Set());
  const [pendingHandoverIds, setPendingHandoverIds] = useState<Set<number>>(new Set());

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<PricingRule | null>(null);
  const [reviewModal, setReviewModal] = useState<{ handover: ShiftHandover; action: "approve" | "reject"; note: string } | null>(null);

  const [ruleSearch, setRuleSearch] = useState("");
  const [handoverSearch, setHandoverSearch] = useState("");
  const [handoverStatusFilter, setHandoverStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED">("ALL");

  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const portalTarget = usePortalTarget();

  const pushToast = useCallback((type: ToastType, message: string) => {
    setToasts((prev) => {
      // Don't stack an identical toast on top of one that's already showing —
      // this is what was causing the pile of repeated "couldn't load" toasts.
      if (prev.some((t) => t.type === type && t.message === message)) return prev;
      const id = Date.now() + Math.random();
      window.setTimeout(() => {
        setToasts((p) => p.filter((t) => t.id !== id));
      }, 4500);
      return [...prev, { id, type, message }];
    });
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---------------------------------------------------------------------------
  // DATA FETCHING — each resource fails independently and is reported, instead
  // of silently collapsing into an empty array with no trace for the user.
  //
  // IMPORTANT: this reads the full ledger from GET /api/payables, not
  // GET /api/payables/outstanding. The /outstanding endpoint drops an invoice
  // the instant it's fully paid — so "Expenses Paid" and "Net Cashflow" below
  // were silently losing that invoice's entire paid amount from the totals
  // the moment it got settled, making it look like paying off a debt in full
  // *improved* cashflow. Also pulls settled RMA credits so "revenue" is
  // defined the same way here as on the Payables page, and pulls payroll
  // (GET /api/salary) so authorizing a salary payout actually shows up as
  // cash leaving the system — it previously wasn't fetched here at all, so
  // Net Cashflow had no idea payroll existed.
  // ---------------------------------------------------------------------------
  const fetchAll = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    const [bookRes, posRes, payRes, rmaRes, salaryRes, rulesRes, handRes, intradayRes] = await Promise.allSettled([
      api.get<Booking[]>("/bookings"),
      api.get<POSRecord[]>("/pos/history"),
      api.get<Payable[]>("/payables"),
      api.get<RmaCredit[]>("/rma"),
      api.get<SalaryRecord[]>("/salary"),
      api.get<PricingRule[]>("/pricing-rules"),
      api.get<ShiftHandover[]>("/pumps/handovers"),
      api.get<IntradayPoint[]>("/analytics/intraday-cashflow"),
    ]);

    const errors: FetchErrors = {};

    const bookings = bookRes.status === "fulfilled" ? bookRes.value.data : (errors.bookings = true, []);
    const pos = posRes.status === "fulfilled" ? posRes.value.data : (errors.pos = true, []);
    const payables = payRes.status === "fulfilled" ? payRes.value.data : (errors.payables = true, []);
    const rma = rmaRes.status === "fulfilled" ? rmaRes.value.data : (errors.rma = true, []);
    const salary = salaryRes.status === "fulfilled" ? salaryRes.value.data : (errors.salary = true, []);
    const rules = rulesRes.status === "fulfilled" ? rulesRes.value.data : (errors.rules = true, []);
    const hand = handRes.status === "fulfilled" ? handRes.value.data : (errors.handovers = true, []);
    const intradayData = intradayRes.status === "fulfilled" ? intradayRes.value.data : (errors.intraday = true, []);

    setData({ bookings, pos, payables, rma, salary });
    setPricingRules(rules);
    setHandovers(hand);
    setIntraday(intradayData);
    setFetchErrors(errors);
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);

    if (Object.keys(errors).length > 0) {
      pushToast("error", "Some panels couldn't load. Check the API connection and retry.");
    } else if (isManualRefresh) {
      pushToast("success", "Dashboard refreshed.");
    }
  }, [pushToast]);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // PRICING RULE ACTIONS
  // ---------------------------------------------------------------------------
  const handleAddRule = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.ruleName.trim() || newRule.percentage <= 0) {
      pushToast("error", "Enter a rule name and a rate greater than 0.");
      return;
    }
    setSavingRule(true);
    try {
      await api.post("/pricing-rules", newRule);
      setNewRule({ ruleName: "", ruleType: "TAX", percentage: 0 });
      pushToast("success", `"${newRule.ruleName}" was added and is now live on new invoices.`);
      await fetchAll();
    } catch {
      pushToast("error", "Couldn't save the pricing rule. Please try again.");
    } finally {
      setSavingRule(false);
    }
  }, [newRule, fetchAll, pushToast]);

  const handleToggleRule = useCallback(async (rule: PricingRule) => {
    setPendingRuleIds((prev) => new Set(prev).add(rule.id));
    try {
      await api.put(`/pricing-rules/${rule.id}/toggle`, {});
      const isActive = rule.active !== undefined ? rule.active : rule.isActive;
      pushToast("success", `"${rule.ruleName}" is now ${isActive ? "inactive" : "active"}.`);
      await fetchAll();
    } catch {
      pushToast("error", `Couldn't update "${rule.ruleName}". Please try again.`);
    } finally {
      setPendingRuleIds((prev) => {
        const next = new Set(prev);
        next.delete(rule.id);
        return next;
      });
    }
  }, [fetchAll, pushToast]);

  const handleDeleteRule = useCallback(async (rule: PricingRule) => {
    setPendingRuleIds((prev) => new Set(prev).add(rule.id));
    try {
      await api.delete(`/pricing-rules/${rule.id}`);
      pushToast("success", `"${rule.ruleName}" was deleted.`);
      await fetchAll();
    } catch {
      pushToast("error", `Couldn't delete "${rule.ruleName}". Please try again.`);
    } finally {
      setPendingRuleIds((prev) => {
        const next = new Set(prev);
        next.delete(rule.id);
        return next;
      });
      setConfirmDelete(null);
    }
  }, [fetchAll, pushToast]);

  // ---------------------------------------------------------------------------
  // SHIFT HANDOVER ACTIONS
  // ---------------------------------------------------------------------------
  const handleReviewHandover = useCallback(async (h: ShiftHandover, action: "approve" | "reject", note: string) => {
    setPendingHandoverIds((prev) => new Set(prev).add(h.id));
    try {
      await api.put(`/pumps/handovers/${h.id}/${action}`, { note: note.trim() || null });
      pushToast("success", action === "approve"
        ? `Pump #${h.pumpNumber}'s handover was approved and cleared.`
        : `Pump #${h.pumpNumber}'s handover was sent back to the supervisor for a recount.`);
      setReviewModal(null);
      await fetchAll();
    } catch (err) {
      // The backend explains why (e.g. a note is required when out of tolerance).
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      pushToast("error", typeof data === "string" && data ? data : `Couldn't update Pump #${h.pumpNumber}'s handover. Please try again.`);
    } finally {
      setPendingHandoverIds((prev) => {
        const next = new Set(prev);
        next.delete(h.id);
        return next;
      });
    }
  }, [fetchAll, pushToast]);

  // ---------------------------------------------------------------------------
  // DERIVED ANALYTICS
  // ---------------------------------------------------------------------------
  const analytics = useMemo(() => {
    const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    const settledWorkshop = data.bookings
      .filter((b) => b.status === "PAID")
      .reduce((sum, b) => sum + (b.totalPartsCost || 0), 0);
    const pendingWorkshop = data.bookings
      .filter((b) => b.status === "COMPLETED")
      .reduce((sum, b) => sum + (b.totalPartsCost || 0), 0);
    const posRev = data.pos.reduce((sum, p) => sum + (p.totalRevenue || 0), 0);
    // Settled RMA credits count as recovered cash, same definition used on the
    // Payables page — kept consistent so the two dashboards never disagree on
    // what "revenue" means for the same underlying data.
    const settledRmaRev = data.rma
      .filter((r) => r.financialStatus === "SETTLED")
      .reduce((sum, r) => sum + (r.totalValue || 0), 0);

    // FUEL STATION CASH. Fuel sales live in their own table and never touch
    // POS, so before this they were missing from every cash figure. Attendants
    // take cash at the pump; it only becomes company cash once a supervisor
    // has counted it (declaredCash) AND finance has approved the handover
    // ("moved to corporate ledger"). We use declaredCash, not expectedCash, so
    // a shortfall on a shift reduces cash rather than being hidden. Unapproved
    // handovers are cash-in-transit — real, but not yet cleared — so they sit
    // with Pending Collections, exactly like an unpaid workshop invoice.
    const fuelCashCleared = handovers
      .filter((h) => h.status === "APPROVED")
      .reduce((sum, h) => sum + (h.declaredCash || 0), 0);
    const fuelCashPending = handovers
      .filter((h) => h.status !== "APPROVED")
      .reduce((sum, h) => sum + (h.declaredCash || 0), 0);

    const totalGrossRevenue = roundMoney(settledWorkshop + posRev + settledRmaRev + fuelCashCleared);
    const totalPendingCollection = roundMoney(pendingWorkshop + fuelCashPending);

    // Only invoices with a genuine remaining balance count toward debt — a
    // fully paid invoice (balance <= 0, allowing for floating point noise)
    // contributes 0, not a small negative or positive rounding artifact.
    const totalSupplierDebt = data.payables.reduce((sum, p) => {
      const balance = roundMoney((p.totalInvoiceAmount || 0) - (p.amountPaid || 0));
      return sum + (balance > 0.005 ? balance : 0);
    }, 0);
    // Now correctly includes every invoice's lifetime amountPaid, fully-paid
    // ones included, since `data.payables` is the full ledger (see fetchAll).
    // Before this fix, paying an invoice off in full removed it from the
    // /outstanding endpoint this figure used to read from — silently dropping
    // that money from "Expenses Paid" and inflating Net Cashflow as a result.
    const totalPaidOut = data.payables.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
    // Payroll has no partial-payment concept — a salary record only exists
    // once it's been processed, which is the same instant the payout happens
    // — so the full sum here is genuine cash already disbursed.
    const totalPayrollPaid = data.salary.reduce((sum, r) => sum + (r.totalSalary ?? r.netSalary ?? 0), 0);
    const outstandingPayablesCount = data.payables.filter((p) => {
      const balance = roundMoney((p.totalInvoiceAmount || 0) - (p.amountPaid || 0));
      return balance > 0.005;
    }).length;

    // The first four bars add up to Total Gross Revenue; the last is money
    // earned but not yet collected/cleared (Pending Collections).
    const revenueStreamData = [
      { name: "Retail POS", amount: posRev, fill: "#3b82f6" },
      { name: "Workshop", amount: settledWorkshop, fill: "#10b981" },
      { name: "Fuel Station", amount: fuelCashCleared, fill: "#06b6d4" },
      { name: "RMA Credits", amount: settledRmaRev, fill: "#8b5cf6" },
      { name: "Pending", amount: totalPendingCollection, fill: "#f59e0b" },
    ];

    const expenseCategories: Record<string, number> = {};
    data.payables.forEach((p) => {
      const balance = roundMoney((p.totalInvoiceAmount || 0) - (p.amountPaid || 0));
      if (balance > 0.005) {
        const key = p.supplyCategory || "Uncategorized";
        expenseCategories[key] = (expenseCategories[key] || 0) + balance;
      }
    });
    const debtPieData = Object.entries(expenseCategories).map(([name, value]) => ({
      name: name.replace(/_/g, " "),
      value,
    }));

    const cashFlowPipeline = [
      { name: "Gross Income", value: totalGrossRevenue, fill: "#10b981" },
      { name: "Supplier Paid", value: totalPaidOut, fill: "#3b82f6" },
      { name: "Payroll Paid", value: totalPayrollPaid, fill: "#a855f7" },
      { name: "Pending Debt", value: totalSupplierDebt, fill: "#ef4444" },
    ];

    return {
      totalGrossRevenue, totalPendingCollection, totalSupplierDebt, totalPayrollPaid, totalPaidOut,
      fuelCashCleared,
      outstandingPayablesCount, revenueStreamData, debtPieData, cashFlowPipeline,
    };
  }, [data, handovers]);

  // Real intraday data (GET /api/analytics/intraday-cashflow) — fuel + retail
  // POS sales bucketed by the hour they actually happened, for today only.
  // Hours later than the current time are legitimately 0 (they haven't
  // happened yet), not a bug — that's what makes this real instead of a
  // projected curve. Workshop revenue is excluded; see AnalyticsController's
  // comment for why.
  const intradayChartData = useMemo(() => {
    return intraday
      .slice()
      .sort((a, b) => a.hour - b.hour)
      .map((point) => ({
        time: new Date(2000, 0, 1, point.hour).toLocaleTimeString("en-US", { hour: "numeric", hour12: true }),
        amount: point.amount,
      }));
  }, [intraday]);
  const hasIntradayActivity = intradayChartData.some((point) => point.amount > 0);

  const PIE_COLORS = ["#0f172a", "#2563eb", "#38bdf8", "#94a3b8", "#1e293b"];
  const formatLKR = useCallback(
    (amt: number) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(amt || 0),
    []
  );
  // Full precision is too wide for KPI cards / the hero number once figures
  // reach the millions (it clips to "LKR 1,344,2…"). Cards use compact
  // notation; exact values stay in tooltips and every table.
  const formatCompactLKR = useCallback(
    (amt: number) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", notation: "compact", maximumFractionDigits: 2 }).format(amt || 0),
    []
  );

  // ---------------------------------------------------------------------------
  // TABLE FILTERING + PAGINATION
  // ---------------------------------------------------------------------------
  const filteredRules = useMemo(() => {
    const q = ruleSearch.trim().toLowerCase();
    if (!q) return pricingRules;
    return pricingRules.filter((r) => r.ruleName.toLowerCase().includes(q) || r.ruleType.toLowerCase().includes(q));
  }, [pricingRules, ruleSearch]);
  const rulesPagination = usePagination(filteredRules, 6);

  const filteredHandovers = useMemo(() => {
    const q = handoverSearch.trim().toLowerCase();
    return handovers.filter((h) => {
      const matchesSearch =
        !q ||
        h.attendantUsername.toLowerCase().includes(q) ||
        h.supervisorUsername.toLowerCase().includes(q) ||
        String(h.pumpNumber).includes(q);
      const matchesStatus =
        handoverStatusFilter === "ALL" ||
        (handoverStatusFilter === "APPROVED" ? h.status === "APPROVED" : h.status !== "APPROVED");
      return matchesSearch && matchesStatus;
    });
  }, [handovers, handoverSearch, handoverStatusFilter]);
  const handoversPagination = usePagination(filteredHandovers, 6);

  // ---------------------------------------------------------------------------
  // LOADING SKELETON — mirrors the real layout instead of one gray box
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 bg-slate-50 min-h-[calc(100vh-4rem)]" aria-busy="true" aria-label="Loading finance dashboard">
        <div className="h-40 bg-slate-200 rounded-[2rem] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-3xl animate-pulse" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="h-80 bg-slate-200 rounded-3xl animate-pulse" />
          <div className="h-80 bg-slate-200 rounded-3xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 bg-slate-50 min-h-[calc(100vh-4rem)]">

      {/* TOASTS — portaled to <body> so they always sit fixed to the real
          viewport, no matter what CSS a parent layout applies. */}
      {portalTarget && createPortal(
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 w-80 max-w-[90vw]" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold ${
                t.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : t.type === "error" ? "bg-red-50 border-red-200 text-red-800"
                : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            >
              {t.type === "success" ? <IconCheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                : t.type === "error" ? <IconAlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                : <IconInfo className="w-5 h-5 flex-shrink-0 mt-0.5" />}
              <span className="flex-1">{t.message}</span>
              <button onClick={() => dismissToast(t.id)} aria-label="Dismiss notification" className="text-current opacity-60 hover:opacity-100">
                <IconXCircle className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>,
        portalTarget
      )}

      {/* HANDOVER REVIEW MODAL — approve (note needed if out of tolerance) or reject (reason required). */}
      {portalTarget && reviewModal && createPortal(
        (() => {
          const h = reviewModal.handover;
          const isReject = reviewModal.action === "reject";
          const noteRequired = isReject || handoverNeedsNote(h);
          const noteOk = !noteRequired || reviewModal.note.trim().length >= 5;
          return (
            <div
              className="fixed inset-0 z-[100] flex items-center-safe justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="review-handover-title"
              onKeyDown={(e) => { if (e.key === "Escape") setReviewModal(null); }}
            >
              <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6">
                <h3 id="review-handover-title" className="text-lg font-black text-slate-900 mb-1.5">
                  {isReject ? "Send back for recount?" : "Approve this handover?"}
                </h3>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Pump #{h.pumpNumber} · @{h.attendantUsername}</p>
                <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                  <span className="text-slate-500">Cash variance</span>
                  <span className={`text-right font-black ${h.variance < 0 ? "text-red-600" : h.variance > 0 ? "text-blue-600" : "text-emerald-600"}`}>{formatLKR(h.variance)}</span>
                  <span className="text-slate-500">Meter vs POS</span>
                  <span className="text-right font-black text-slate-900">
                    {h.literVariance == null ? "Not reconciled" : `${h.literVariance > 0 ? "+" : ""}${h.literVariance.toFixed(2)} L`}
                  </span>
                </div>
                {!isReject && noteRequired && (
                  <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                    Outside tolerance (±{formatLKR(HANDOVER_CASH_TOLERANCE)} cash, ±{HANDOVER_METER_TOLERANCE_L} L meter). Explain why you are approving it.
                  </p>
                )}
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">
                  {isReject ? "Reason (required)" : noteRequired ? "Approval note (required)" : "Note (optional)"}
                </label>
                <textarea
                  rows={3}
                  value={reviewModal.note}
                  onChange={(e) => setReviewModal({ ...reviewModal, note: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium outline-none focus:border-blue-400 mb-5"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setReviewModal(null)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleReviewHandover(h, reviewModal.action, reviewModal.note)}
                    disabled={!noteOk || pendingHandoverIds.has(h.id)}
                    className={`flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-colors ${isReject ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-blue-600"}`}
                  >
                    {pendingHandoverIds.has(h.id) ? "Saving..." : isReject ? "Reject" : "Approve & Clear"}
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        portalTarget
      )}

      {/* CONFIRM DELETE MODAL — also portaled, for the same reason. */}
      {portalTarget && confirmDelete && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center-safe justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
          onKeyDown={(e) => { if (e.key === "Escape") setConfirmDelete(null); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6">
            <div className="w-11 h-11 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-4">
              <IconAlertTriangle className="w-6 h-6" />
            </div>
            <h3 id="confirm-delete-title" className="text-lg font-black text-slate-900 mb-1.5">Delete this rule?</h3>
            <p className="text-sm text-slate-500 font-medium mb-6">
              "{confirmDelete.ruleName}" will stop applying to new invoices immediately. This can't be undone.
            </p>
            <div className="flex gap-3">
              <button
                ref={cancelButtonRef}
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRule(confirmDelete)}
                disabled={pendingRuleIds.has(confirmDelete.id)}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {pendingRuleIds.has(confirmDelete.id) ? "Deleting..." : "Delete rule"}
              </button>
            </div>
          </div>
        </div>,
        portalTarget
      )}

      {/* FETCH ERROR BANNER */}
      {Object.keys(fetchErrors).length > 0 && (
        <div className="flex items-center justify-between gap-4 px-6 py-4 bg-red-50 border border-red-200 rounded-2xl">
          <div className="flex items-center gap-3">
            <IconAlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm font-bold text-red-700">
              Couldn't load: {Object.keys(fetchErrors).join(", ")}. Figures below may be incomplete.
            </p>
          </div>
          <button
            onClick={() => fetchAll(true)}
            className="text-xs font-black uppercase tracking-widest text-red-700 hover:text-red-900 whitespace-nowrap"
          >
            Retry now
          </button>
        </div>
      )}

      {/* HERO */}
      <div className="bg-slate-900 p-8 lg:p-10 rounded-[2rem] shadow-2xl text-white relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="relative z-10">
          <h2 className="text-3xl lg:text-4xl font-black tracking-tight mb-2">Executive Finance Hub</h2>
          <p className="text-slate-400 font-medium text-sm lg:text-base max-w-md">
            {userName ? `Welcome back, ${userName}. ` : ""}Master analytics combining workshop revenue, retail POS, and accounts payable.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors disabled:opacity-60"
            >
              <IconRefresh className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh data"}
            </button>
            {lastUpdated && (
              <span className="text-[11px] text-slate-500 font-semibold">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        {/* Available funds come from the backend ledger (opening balance + money in −
            expenses, supplier payments and payroll); the old figure here left out expenses. */}
        <div className="relative z-10">
          <FundsPosition refreshKey={lastUpdated?.getTime() ?? 0} />
        </div>
        <div className="absolute -top-32 -right-32 w-[30rem] h-[30rem] bg-blue-600/20 rounded-full blur-[100px] pointer-events-none" />
      </div>

      <DailyBrief />
      <FinanceAlerts refreshKey={lastUpdated?.getTime() ?? 0} />

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard icon={<IconWallet className="w-5 h-5" />} label="Total Gross Revenue" value={formatCompactLKR(analytics.totalGrossRevenue)} exactValue={formatLKR(analytics.totalGrossRevenue)} sub="Cash actually received" accent="text-emerald-600 bg-emerald-50" />
        <KpiCard icon={<IconAlertTriangle className="w-5 h-5" />} label="Current Supplier Debt" value={formatCompactLKR(analytics.totalSupplierDebt)} exactValue={formatLKR(analytics.totalSupplierDebt)} sub="Still owed to suppliers" accent="text-red-600 bg-red-50" />
        <KpiCard icon={<IconClock className="w-5 h-5" />} label="Pending Collections" value={formatCompactLKR(analytics.totalPendingCollection)} exactValue={formatLKR(analytics.totalPendingCollection)} sub="Unpaid jobs + shift cash awaiting audit" accent="text-amber-600 bg-amber-50" />
        <KpiCard icon={<IconFileText className="w-5 h-5" />} label="Accounts Payable Ledger" value={String(analytics.outstandingPayablesCount)} sub="unpaid invoices" accent="text-blue-600 bg-blue-50" />
      </div>

      {/* CHARTS ROW 1 */}
      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40">
          <div className="mb-6 flex justify-between items-start gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-900">Intraday Cash Flow</h3>
              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Fuel &amp; Retail POS only &middot; resets daily</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest flex-shrink-0" title="Real sales, bucketed by the hour they happened today. Workshop revenue isn't included — ServiceBooking has no timestamp for when a job was actually paid.">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live &middot; today
            </span>
          </div>
          {hasIntradayActivity ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={intradayChartData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="time" interval={2} tick={{ fontSize: 11, fill: "#64748b", fontWeight: "bold" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b", fontWeight: "bold" }} axisLine={false} tickLine={false} tickFormatter={(val) => `${val / 1000}k`} />
                <Tooltip contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1)" }} formatter={(value) => [formatLKR(Number(value)), "Collected"]} />
                <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={4} dot={{ r: 3, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-center px-6">
              <p className="text-sm font-bold text-slate-400">No fuel or retail sales recorded yet today.</p>
            </div>
          )}
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 flex flex-col">
          <h3 className="text-lg font-black text-slate-900 mb-2">Active Debt by Category</h3>
          <div className="flex-1 flex items-center justify-center">
            {analytics.debtPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={analytics.debtPieData} innerRadius={90} outerRadius={130} paddingAngle={4} dataKey="value" stroke="none">
                    {analytics.debtPieData.map((_, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1)" }} formatter={(value) => [formatLKR(Number(value)), "Unpaid Debt"]} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: "11px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase", letterSpacing: "1px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-emerald-600 font-black tracking-widest uppercase text-sm">Ledger is totally clear</div>
            )}
          </div>
        </div>
      </div>

      {/* CHARTS ROW 2 */}
      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40">
          <h3 className="text-lg font-black text-slate-900 mb-8">Revenue Streams Breakdown</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={analytics.revenueStreamData} margin={{ top: 0, right: 10, left: 20, bottom: 0 }} maxBarSize={60}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b", fontWeight: "bold" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b", fontWeight: "bold" }} axisLine={false} tickLine={false} tickFormatter={(val) => `Rs.${val / 1000}k`} />
              <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1)" }} formatter={(value) => [formatLKR(Number(value)), "Amount"]} />
              <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                {analytics.revenueStreamData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40">
          <h3 className="text-lg font-black text-slate-900 mb-8">Master Cash Flow Pipeline</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={analytics.cashFlowPipeline} margin={{ top: 0, right: 30, left: 10, bottom: 0 }} layout="vertical" maxBarSize={50}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b", fontWeight: "bold" }} axisLine={false} tickLine={false} tickFormatter={(val) => `Rs.${val / 1000}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#0f172a", fontWeight: 900 }} tickFormatter={(name) => String(name).toUpperCase()} axisLine={false} tickLine={false} width={130} />
              <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1)" }} formatter={(value) => [formatLKR(Number(value)), "Total"]} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                {analytics.cashFlowPipeline.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* PRICING RULES */}
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-slate-900 text-white p-8 rounded-3xl shadow-xl shadow-slate-200/40 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-black mb-2">Global Pricing Rules</h3>
            <p className="text-xs text-slate-400 font-medium mb-6">
              Create global tax brackets or temporary promotional discounts. Active rules apply instantly to all newly generated invoices.
            </p>
            <form onSubmit={handleAddRule} className="space-y-4">
              <div>
                <label htmlFor="ruleName" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Rule Identifier</label>
                <input
                  id="ruleName" required type="text" placeholder="e.g. VAT 18% or Seasonal Promo"
                  value={newRule.ruleName}
                  onChange={(e) => setNewRule({ ...newRule, ruleName: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ruleType" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Classification</label>
                  <select
                    id="ruleType" value={newRule.ruleType}
                    onChange={(e) => setNewRule({ ...newRule, ruleType: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
                  >
                    <option value="TAX">Tax Charge</option>
                    <option value="DISCOUNT">Discount</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="rulePercentage" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Rate (%)</label>
                  <input
                    id="rulePercentage" required type="number" step="0.1" min="0.1"
                    value={newRule.percentage}
                    onChange={(e) => setNewRule({ ...newRule, percentage: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
                  />
                </div>
              </div>
              <button
                type="submit" disabled={savingRule}
                className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:hover:bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors active:scale-95 shadow-md"
              >
                {savingRule ? "Saving..." : "Register New Rule"}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden flex flex-col">
          <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-lg font-black text-slate-900">Active Financial Configurations</h3>
            <div className="relative">
              <IconSearch className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" placeholder="Search rules..." value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
                aria-label="Search pricing rules"
                className="pl-8 pr-3 py-2 bg-slate-100 border border-transparent focus:border-blue-400 focus:bg-white rounded-xl text-xs font-bold text-slate-700 outline-none transition-colors w-full sm:w-52"
              />
            </div>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th scope="col" className="px-8 py-4">Pricing Engine Rule</th>
                  <th scope="col" className="px-8 py-4">Impact Modifier</th>
                  <th scope="col" className="px-8 py-4 text-center">System Status</th>
                  <th scope="col" className="px-8 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                {rulesPagination.pageItems.map((rule) => {
                  const isRuleActive = rule.active !== undefined ? rule.active : rule.isActive;
                  const isPending = pendingRuleIds.has(rule.id);
                  return (
                    <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-4 font-bold text-slate-900">{rule.ruleName}</td>
                      <td className="px-8 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${rule.ruleType === "TAX" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                          {rule.ruleType === "TAX" ? "+" : "-"}{rule.percentage}% {rule.ruleType}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <button
                          onClick={() => handleToggleRule(rule)}
                          disabled={isPending}
                          aria-pressed={!!isRuleActive}
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm border disabled:opacity-60 ${
                            isRuleActive
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200"
                              : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                          }`}
                        >
                          {isRuleActive ? <IconCheckCircle className="w-3.5 h-3.5" /> : <IconXCircle className="w-3.5 h-3.5" />}
                          {isPending ? "Updating..." : isRuleActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <button
                          onClick={() => setConfirmDelete(rule)}
                          disabled={isPending}
                          aria-label={`Delete rule ${rule.ruleName}`}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-60"
                        >
                          <IconTrash className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {rulesPagination.pageItems.length === 0 && (
                  <tr><td colSpan={4} className="px-8 py-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                    {ruleSearch ? "No rules match your search." : "No pricing rules configured."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar pagination={rulesPagination} itemLabel="rules" />
        </div>
      </div>

      {/* SHIFT HANDOVERS */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-900">Fuel Station Shift Audits & Handovers</h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Review supervisor-verified shift handovers, check cash variances, and clear deposits into the corporate ledger.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <IconSearch className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" placeholder="Search pump or username..." value={handoverSearch}
                onChange={(e) => setHandoverSearch(e.target.value)}
                aria-label="Search shift handovers"
                className="pl-8 pr-3 py-2 bg-slate-100 border border-transparent focus:border-blue-400 focus:bg-white rounded-xl text-xs font-bold text-slate-700 outline-none transition-colors w-48"
              />
            </div>
            <select
              value={handoverStatusFilter}
              onChange={(e) => setHandoverStatusFilter(e.target.value as typeof handoverStatusFilter)}
              aria-label="Filter by audit status"
              className="px-3 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-blue-400"
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
            </select>
            <button
              onClick={() => exportHandoversCSV(filteredHandovers)}
              disabled={filteredHandovers.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
            >
              <IconDownload className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th scope="col" className="px-8 py-4">Pump & Attendant</th>
                <th scope="col" className="px-8 py-4">Supervisor</th>
                <th scope="col" className="px-8 py-4 text-right">Expected Cash</th>
                <th scope="col" className="px-8 py-4 text-right">Declared Cash</th>
                <th scope="col" className="px-8 py-4 text-right">Variance</th>
                <th scope="col" className="px-8 py-4 text-center">Audit Status</th>
                <th scope="col" className="px-8 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
              {handoversPagination.pageItems.map((h) => {
                const isPending = pendingHandoverIds.has(h.id);
                return (
                  <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4">
                      <p className="font-black text-slate-900">Pump #{h.pumpNumber}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">@{h.attendantUsername}</p>
                    </td>
                    <td className="px-8 py-4 font-bold text-slate-600">@{h.supervisorUsername}</td>
                    <td className="px-8 py-4 text-right font-bold text-slate-900">
                      {formatLKR(h.expectedCash)}
                      {h.nonCashSales != null && h.nonCashSales > 0 && (
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5">+ {formatLKR(h.nonCashSales)} card/QR</p>
                      )}
                    </td>
                    <td className="px-8 py-4 text-right font-bold text-slate-900">{formatLKR(h.declaredCash)}</td>
                    <td className="px-8 py-4 text-right font-black">
                      <span className={`inline-flex items-center gap-1 ${h.variance < 0 ? "text-red-500" : h.variance > 0 ? "text-blue-500" : "text-emerald-600"}`}>
                        {h.variance !== 0 && <IconAlertTriangle className="w-3.5 h-3.5" />}
                        {h.variance > 0 ? `+${formatLKR(h.variance)}` : formatLKR(h.variance)}
                      </span>
                      <p className={`text-[10px] font-bold mt-0.5 ${h.literVariance != null && Math.abs(h.literVariance) > HANDOVER_METER_TOLERANCE_L ? "text-red-500" : "text-slate-400"}`}>
                        {h.literVariance == null ? "meter n/a" : `meter ${h.literVariance > 0 ? "+" : ""}${h.literVariance.toFixed(2)} L`}
                      </p>
                    </td>
                    <td className="px-8 py-4 text-center">
                      <span
                        title={h.reviewNote ? `${h.reviewedBy ?? ""}: ${h.reviewNote}` : undefined}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${
                        h.status === "APPROVED" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : h.status === "REJECTED" ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>
                        {h.status === "APPROVED" ? <IconCheckCircle className="w-3 h-3" /> : <IconClock className="w-3 h-3" />}
                        {h.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-right">
                      {h.status === "PENDING_AUDIT" ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setReviewModal({ handover: h, action: "reject", note: "" })}
                            disabled={isPending}
                            className="px-3 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => setReviewModal({ handover: h, action: "approve", note: "" })}
                            disabled={isPending}
                            className="px-4 py-2 bg-slate-900 hover:bg-blue-600 disabled:opacity-60 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                          >
                            {isPending ? "Saving..." : "Approve & Clear"}
                          </button>
                        </div>
                      ) : h.status === "APPROVED" ? (
                        <span className="text-xs font-bold text-slate-400">Archived</span>
                      ) : (
                        // NEEDS_COUNT / REJECTED: waiting on the supervisor's (re)count.
                        <span className="text-xs font-bold text-amber-600">Awaiting supervisor count</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {handoversPagination.pageItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-12 text-center text-slate-400 font-medium">
                    {handoverSearch || handoverStatusFilter !== "ALL"
                      ? "No handovers match your filters."
                      : "No shift handover reports submitted by supervisors yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar pagination={handoversPagination} itemLabel="handovers" />
      </div>
    </div>
  );
}

// =============================================================================
// PRESENTATIONAL SUBCOMPONENTS
// =============================================================================
function KpiCard({
  icon, label, value, exactValue, sub, accent,
}: { icon: React.ReactNode; label: string; value: string; exactValue?: string; sub?: string; accent: string }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 hover:-translate-y-1 transition-transform">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</h3>
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${accent}`}>{icon}</span>
      </div>
      <div className="text-3xl font-black text-slate-900" title={exactValue || value}>{value}</div>
      {exactValue && <p className="text-[11px] text-slate-400 font-semibold mt-1 truncate">{exactValue}</p>}
      {sub && <p className="text-xs text-slate-400 font-semibold mt-1">{sub}</p>}
    </div>
  );
}

function PaginationBar<T>({
  pagination, itemLabel,
}: { pagination: ReturnType<typeof usePagination<T>>; itemLabel: string }) {
  if (pagination.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-8 py-4 border-t border-slate-100 bg-slate-50/50">
      <span className="text-xs font-bold text-slate-400">
        Page {pagination.page} of {pagination.totalPages} {itemLabel}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => pagination.setPage((p) => Math.max(1, p - 1))}
          disabled={pagination.page === 1}
          aria-label="Previous page"
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors"
        >
          <IconChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => pagination.setPage((p) => Math.min(pagination.totalPages, p + 1))}
          disabled={pagination.page === pagination.totalPages}
          aria-label="Next page"
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors"
        >
          <IconChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
