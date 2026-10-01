"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import api from "../../utils/axiosInstance";
import { getErrorMessage as extractErrorMessage } from "../../utils/apiError";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { downloadCsv as downloadCSV } from "../billing/_components/billing";

const MANAGEMENT_ROLES = ["ACCOUNTS_FINANCE_OFFICER", "SUPER_ADMIN", "SYSTEM_ADMIN", "EXECUTIVE_OWNER"];

// =============================================================================
// VALIDATION
// zod v4 + @hookform/resolvers v5: coerced number fields need the two-generic
// useForm pattern (z.input for the raw form, z.output for what onSubmit
// receives) or numeric fields type as `unknown`. Same fix applied on the
// Payables page.
// =============================================================================
const payrollSchema = z.object({
  technicianName: z.string().min(2, "Please select an employee from the secure database."),
  technicianEmail: z.string().email("A valid email is required for secure PDF dispatch."),
  month: z.string()
    .regex(/^\d{4}-\d{2}$/, "Invalid date format.")
    .refine((val) => new Date(val) <= new Date(), "Cannot process payroll for future months."),
  hoursWorked: z.coerce.number()
    .min(0, "Hours cannot be negative.")
    .max(350, "Exceeds max allowable monthly limit (350h)."),
  hourlyRate: z.coerce.number()
    .min(100, "Violates minimum wage policy.")
    .max(20000, "Exceeds standard rate limits."),
  allowances: z.coerce.number().min(0, "Allowances cannot be negative."),
  deductions: z.coerce.number().min(0, "Deductions cannot be negative."),
}).refine(
  (data) => (data.hoursWorked * data.hourlyRate) + data.allowances - data.deductions >= 0,
  { message: "Deductions exceed total earnings — this would process a negative payout. Review the figures.", path: ["deductions"] }
);

type PayrollFormInput = z.input<typeof payrollSchema>;
type PayrollFormOutput = z.output<typeof payrollSchema>;

interface TechnicianSalary {
  salaryId: number;
  technicianName: string;
  technicianEmail: string;
  month: string;
  payrollMonth?: string;
  hourlyRate: number;
  hoursWorked: number;
  totalSalary?: number;
  netSalary?: number;
}

interface UserAccount {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: string;
}

// Monthly attendance from GET /api/roster/hours.
interface AttendanceSummary {
  workedHours: number;
  completedShifts: number;
  absentShifts: number;
  lateShifts: number;
  autoClosedShifts: number;
  openShifts: number;
}

interface FetchErrors {
  salaries?: boolean;
  users?: boolean;
}

type ToastType = "success" | "error" | "info";
interface ToastItem { id: number; type: ToastType; message: string; }

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void | Promise<void>;
}
const CLOSED_CONFIRM: ConfirmState = { isOpen: false, title: "", message: "", confirmLabel: "Confirm", pending: false, onConfirm: () => {} };

// =============================================================================
// ICONS
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
function IconSearch({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M21 21l-4.35-4.35m1.6-5.4a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}
function IconDownload({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3" /></svg>;
}
function IconRefresh({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
}
function IconChevronLeft({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>;
}
function IconChevronRight({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>;
}
function IconMail({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M2.25 6.75c0-.414.336-.75.75-.75h18c.414 0 .75.336.75.75v10.5a.75.75 0 01-.75.75H3a.75.75 0 01-.75-.75V6.75zm.5-.03L12 13.5l9.25-6.78" /></svg>;
}
function IconFileText({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;
}

// =============================================================================
// UTILITIES
// =============================================================================
function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const pageItems = useMemo(() => items.slice((clampedPage - 1) * pageSize, clampedPage * pageSize), [items, clampedPage, pageSize]);
  return { page: clampedPage, setPage, totalPages, pageItems };
}

function PaginationBar<T>({ pagination, itemLabel }: { pagination: ReturnType<typeof usePagination<T>>; itemLabel: string }) {
  if (pagination.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-2 py-4 border-t border-slate-100">
      <span className="text-xs font-bold text-slate-400">Page {pagination.page} of {pagination.totalPages} {itemLabel}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => pagination.setPage((p) => Math.max(1, p - 1))} disabled={pagination.page === 1} aria-label="Previous page"
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors">
          <IconChevronLeft />
        </button>
        <button onClick={() => pagination.setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={pagination.page === pagination.totalPages} aria-label="Next page"
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors">
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

function SearchInput({ value, onChange, placeholder, ariaLabel, className = "w-56" }: {
  value: string; onChange: (v: string) => void; placeholder: string; ariaLabel: string; className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 bg-slate-100 border border-transparent focus-within:border-blue-400 focus-within:bg-white rounded-xl px-3 py-2 transition-colors ${className}`}>
      <IconSearch c="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel}
        className="bg-transparent outline-none text-xs font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-medium w-full min-w-0" />
    </div>
  );
}

function exportSalariesCSV(rows: TechnicianSalary[]) {
  const headers = ["Salary ID", "Employee", "Email", "Period", "Hours", "Rate", "Net Salary"];
  const body = rows.map((sal) => [sal.salaryId, sal.technicianName, sal.technicianEmail, sal.month || sal.payrollMonth || "", sal.hoursWorked || 0, sal.hourlyRate || 0, sal.totalSalary ?? sal.netSalary ?? 0]);
  downloadCSV("salary-ledger", headers, body);
}

function formatMonth(monthString?: string) {
  if (!monthString) return "N/A";
  if (/^\d{4}-\d{2}$/.test(monthString)) {
    const [year, month] = monthString.split("-");
    return new Date(Number(year), Number(month) - 1).toLocaleString("default", { month: "long", year: "numeric" });
  }
  const parsedDate = new Date(monthString);
  return !isNaN(parsedDate.getTime()) ? parsedDate.toLocaleString("default", { month: "long", year: "numeric" }) : monthString;
}

function formatLKR(amt: number) {
  return `Rs. ${(amt || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SalaryDashboard() {
  const { user } = useAuth();
  const router = useRouter();

  const [salaries, setSalaries] = useState<TechnicianSalary[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchErrors, setFetchErrors] = useState<FetchErrors>({});

  const [isGeneratingPdf, setIsGeneratingPdf] = useState<number | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState<number | null>(null);
  const [suggestedRate, setSuggestedRate] = useState<number | null>(null);
  const [rosterSyncWarning, setRosterSyncWarning] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>(CLOSED_CONFIRM);
  const portalTarget = usePortalTarget();
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  const [salarySearch, setSalarySearch] = useState("");

  const isManagement = user ? MANAGEMENT_ROLES.includes(user.role) : false;

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<PayrollFormInput, any, PayrollFormOutput>({
    resolver: zodResolver(payrollSchema),
    mode: "onChange",
    defaultValues: { hourlyRate: 850, hoursWorked: 0, allowances: 0, deductions: 0 },
  });

  const selectedEmployee = watch("technicianName");
  const selectedMonth = watch("month");
  const currentHours = Number(watch("hoursWorked")) || 0;
  const currentRate = Number(watch("hourlyRate")) || 0;
  const currentAllowances = Number(watch("allowances")) || 0;
  const currentDeductions = Number(watch("deductions")) || 0;
  const liveNetSalary = (currentHours * currentRate) + currentAllowances - currentDeductions;

  const pushToast = useCallback((type: ToastType, message: string) => {
    setToasts((prev) => {
      if (prev.some((t) => t.type === type && t.message === message)) return prev;
      const id = Date.now() + Math.random();
      window.setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000);
      return [...prev, { id, type, message }];
    });
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  // SECURITY NOTE: this redirect is a UX nicety only, not the real access
  // control — SecurityConfig's own authority rules on GET /api/salary are
  // what actually stop a non-management account from reading payroll data.
  // This just avoids showing them a page they'd immediately get a 403 from.
  useEffect(() => {
    if (user && !isManagement) router.push("/salary/my-payslips");
  }, [user, isManagement, router]);

  // ---------------------------------------------------------------------------
  // DATA FETCHING — salaries and users fail independently and are reported,
  // instead of one failure silently blanking both (the old code used
  // Promise.all, where either request failing killed both lists with nothing
  // shown to the user but a console.error).
  // ---------------------------------------------------------------------------
  const fetchAll = useCallback(async (isManualRefresh = false) => {
    if (!user || !isManagement) return;
    if (isManualRefresh) setRefreshing(true); else setLoading(true);

    const [salaryRes, userRes] = await Promise.allSettled([
      api.get<TechnicianSalary[]>("/salary"),
      api.get<UserAccount[]>("/auth/all"),
    ]);

    const errors: FetchErrors = {};
    const salaryData = salaryRes.status === "fulfilled" ? salaryRes.value.data : (errors.salaries = true, []);
    const userData = userRes.status === "fulfilled" ? userRes.value.data : (errors.users = true, []);

    setSalaries([...salaryData].sort((a, b) => b.salaryId - a.salaryId));
    // Exclude customers and the top-tier roles from the payable staff list —
    // they aren't on hourly/shift payroll.
    setUsers(userData.filter((u) => !["CUSTOMER", "SUPER_ADMIN", "EXECUTIVE_OWNER", "SYSTEM_ADMIN"].includes(u.role)));
    setFetchErrors(errors);
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);

    if (Object.keys(errors).length > 0) {
      pushToast("error", `Couldn't load: ${Object.keys(errors).join(", ")}. Figures below may be incomplete.`);
    } else if (isManualRefresh) {
      pushToast("success", "Ledger refreshed.");
    }
  }, [user, isManagement, pushToast]);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isManagement]);

  // ---------------------------------------------------------------------------
  // ROSTER AUTO-SYNC — a failure here used to be silent (console.error only),
  // which is dangerous specifically because it affects the hours a real
  // paycheck gets calculated from. Now it's surfaced as a visible warning.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const syncEmployeeData = async () => {
      if (!selectedEmployee) return;
      setRosterSyncWarning(false);

      const employee = users.find((u) => u.username === selectedEmployee);
      if (employee) {
        setValue("technicianEmail", employee.email || `${employee.username}@lankaauto.com`);

        let rate = 850;
        if (employee.role === "SERVICE_CENTER_MANAGER") rate = 1500;
        if (employee.role === "ACCOUNTS_FINANCE_OFFICER") rate = 1200;
        setSuggestedRate(rate);
        setValue("hourlyRate", rate);
      }

      setAttendance(null);
      if (selectedMonth && employee) {
        try {
          // Actual hours from roster clock-in/out (completed shifts only), so
          // absences and short shifts are no longer paid as a flat 8 hours.
          const res = await api.get<AttendanceSummary>("/roster/hours", {
            params: { username: employee.username, month: selectedMonth },
          });
          setAttendance(res.data);
          setValue("hoursWorked", res.data.workedHours);
        } catch {
          setRosterSyncWarning(true);
          pushToast("error", `Couldn't auto-sync ${employee.username}'s hours from the roster — enter hours manually and double-check before processing.`);
        }
      }
    };
    syncEmployeeData();
  }, [selectedEmployee, selectedMonth, users, setValue, pushToast]);

  // ---------------------------------------------------------------------------
  // SUBMIT — payroll is a real financial action, so it goes through the same
  // confirm-before-firing pattern as a full invoice settlement on the
  // Payables page, rather than submitting the instant the button is clicked.
  // ---------------------------------------------------------------------------
  const processPayroll = useCallback(async (data: PayrollFormOutput) => {
    setConfirmState((prev) => ({ ...prev, pending: true }));
    try {
      const netSalary = (data.hourlyRate * data.hoursWorked) + data.allowances - data.deductions;
      const payload = {
        technicianName: data.technicianName,
        technicianEmail: data.technicianEmail,
        month: data.month,
        hoursWorked: data.hoursWorked,
        hourlyRate: data.hourlyRate,
        totalSalary: netSalary,
      };
      await api.post("/salary/process", payload);
      pushToast("success", `Payroll processed for ${data.technicianName} — ${formatLKR(netSalary)} authorized.`);
      reset();
      setSuggestedRate(null);
      await fetchAll();
    } catch (err) {
      const msg = extractErrorMessage(err, "Payroll calculation failed. Review the inputs and try again.");
      if (msg.includes("already been processed")) {
        pushToast("error", `Duplicate blocked: ${data.technicianName} has already been processed for this period.`);
      } else {
        pushToast("error", msg);
      }
    } finally {
      setConfirmState(CLOSED_CONFIRM);
    }
  }, [reset, fetchAll, pushToast]);

  const onSubmit = (data: PayrollFormOutput) => {
    const netSalary = (data.hourlyRate * data.hoursWorked) + data.allowances - data.deductions;
    setConfirmState({
      isOpen: true,
      title: "Authorize this payout?",
      message: `${data.technicianName} — ${formatMonth(data.month)}. ${formatLKR(netSalary)} will be recorded and made available for payslip dispatch. This creates a permanent ledger entry.`,
      confirmLabel: "Authorize payout",
      pending: false,
      onConfirm: () => processPayroll(data),
    });
  };

  // ---------------------------------------------------------------------------
  // PDF / EMAIL DISPATCH
  // ---------------------------------------------------------------------------
  const handleGeneratePdf = async (salaryId: number) => {
    setIsGeneratingPdf(salaryId);
    try {
      const response = await api.get(`/salary/${salaryId}/payslip`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `LankaAutoCare_Payslip_${salaryId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      pushToast("error", extractErrorMessage(err, "Failed to generate the PDF payslip."));
    } finally {
      setIsGeneratingPdf(null);
    }
  };

  const handleSendEmail = async (salaryId: number) => {
    setIsSendingEmail(salaryId);
    try {
      await api.post(`/salary/${salaryId}/send-email`, {});
      pushToast("success", "Payslip dispatched to the employee.");
    } catch (err) {
      pushToast("error", extractErrorMessage(err, "Email dispatch failed. Check the backend mail configuration."));
    } finally {
      setIsSendingEmail(null);
    }
  };

  const filteredSalaries = useMemo(() => {
    const q = salarySearch.trim().toLowerCase();
    if (!q) return salaries;
    return salaries.filter((sal) => sal.technicianName?.toLowerCase().includes(q) || sal.technicianEmail?.toLowerCase().includes(q));
  }, [salaries, salarySearch]);
  const salariesPagination = usePagination(filteredSalaries, 10);

  if (!isManagement) return null;

  if (loading) {
    return (
      <div className="p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)]" aria-busy="true" aria-label="Loading payroll">
        <div className="max-w-[1500px] mx-auto space-y-8">
          <div className="h-14 bg-slate-200 rounded-2xl animate-pulse w-1/2" />
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="h-[600px] bg-slate-200 rounded-3xl animate-pulse" />
            <div className="xl:col-span-2 h-[600px] bg-slate-200 rounded-3xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] animate-fade-in-up">
      <div className="max-w-[1500px] mx-auto">

        {Object.keys(fetchErrors).length > 0 && (
          <div className="flex items-center justify-between gap-4 px-6 py-4 bg-red-50 border border-red-200 rounded-2xl mb-6">
            <div className="flex items-center gap-3">
              <IconAlertTriangle c="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm font-bold text-red-700">Couldn't load: {Object.keys(fetchErrors).join(", ")}. Figures below may be incomplete.</p>
            </div>
            <button onClick={() => fetchAll(true)} className="text-xs font-black uppercase tracking-widest text-red-700 hover:text-red-900 whitespace-nowrap">Retry now</button>
          </div>
        )}

        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Global Payroll & Commissions</h1>
            <p className="text-slate-500 font-medium mt-1">Cross-reference manager rosters, calculate monthly salaries, and dispatch secure payslips.</p>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={() => fetchAll(true)} disabled={refreshing} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg text-xs font-bold text-slate-600 transition-colors">
                <IconRefresh c={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              {lastUpdated && <span className="text-[11px] text-slate-400 font-semibold">Updated {lastUpdated.toLocaleTimeString()}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-1">
            <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-200 sticky top-6">
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-xl font-black text-slate-800">Process Salary</h2>
                <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 px-2 py-1 rounded border border-emerald-100">Live Sync</span>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label htmlFor="technicianName" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Select Employee</label>
                  <select id="technicianName" {...register("technicianName")}
                    className={`w-full px-4 py-3 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all font-bold cursor-pointer ${errors.technicianName ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"}`}>
                    <option value="">-- Select from Database --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.username}>{u.fullName || u.username} ({u.role.replace("_", " ")})</option>
                    ))}
                  </select>
                  {errors.technicianName && <p className="mt-1 text-xs font-bold text-red-500">{errors.technicianName.message}</p>}
                </div>

                <div>
                  <label htmlFor="technicianEmail" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Official Email</label>
                  <input id="technicianEmail" {...register("technicianEmail")} type="email" readOnly className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 font-medium outline-none cursor-not-allowed" />
                </div>

                <div>
                  <label htmlFor="month" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Payroll Month</label>
                  <input id="month" {...register("month")} type="month" className={`w-full px-4 py-3 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all font-bold ${errors.month ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"}`} />
                  <p className="text-[10px] font-bold text-blue-500 mt-1.5">Select month to auto-fill hours from roster attendance (clock-in/out of completed shifts).</p>
                  {attendance && (
                    <p className="text-[10px] font-bold text-slate-600 mt-1">
                      {attendance.completedShifts} completed · {attendance.absentShifts} absent · {attendance.lateShifts} late
                      {attendance.autoClosedShifts > 0 && <span className="text-orange-700"> · {attendance.autoClosedShifts} auto clock-out (verify)</span>}
                      {attendance.openShifts > 0 && <span className="text-orange-700"> · {attendance.openShifts} shifts not finished yet</span>}
                    </p>
                  )}
                  {rosterSyncWarning && (
                    <p className="text-[10px] font-bold text-red-500 mt-1 flex items-center gap-1"><IconAlertTriangle c="w-3 h-3" /> Auto-sync failed — hours below need manual review.</p>
                  )}
                  {errors.month && <p className="mt-1 text-xs font-bold text-red-500">{errors.month.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="hoursWorked" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Hours Worked</label>
                    <input id="hoursWorked" {...register("hoursWorked")} type="number" step="0.5" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-black text-blue-700" />
                    {errors.hoursWorked && <p className="mt-1 text-xs font-bold text-red-500">{errors.hoursWorked.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="hourlyRate" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Rate / Hr (LKR)</label>
                    <input id="hourlyRate" {...register("hourlyRate")} type="number" step="0.01" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-bold" />
                    {suggestedRate !== null && currentRate !== suggestedRate && (
                      <p className="text-[10px] font-bold text-amber-600 mt-1">Overridden from the role's suggested {formatLKR(suggestedRate)}.</p>
                    )}
                    {errors.hourlyRate && <p className="mt-1 text-xs font-bold text-red-500">{errors.hourlyRate.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div>
                    <label htmlFor="allowances" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Allowances (+)</label>
                    <input id="allowances" {...register("allowances")} type="number" step="0.01" className="w-full px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 outline-none font-bold text-emerald-700" />
                  </div>
                  <div>
                    <label htmlFor="deductions" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Deductions (-)</label>
                    <input id="deductions" {...register("deductions")} type="number" step="0.01" className="w-full px-4 py-3 rounded-xl border border-red-200 bg-red-50 outline-none font-bold text-red-700" />
                    {errors.deductions && <p className="mt-1 text-xs font-bold text-red-500">{errors.deductions.message}</p>}
                  </div>
                </div>

                <div className="bg-slate-900 text-white rounded-2xl p-5 mt-6 shadow-xl">
                  <div className="flex justify-between text-sm mb-2 font-medium">
                    <span className="text-slate-400">Base Salary</span>
                    <span>{formatLKR(currentHours * currentRate)}</span>
                  </div>
                  <div className="flex justify-between text-xl font-black border-t border-slate-700 pt-3 mt-1">
                    <span>Net Payout</span>
                    <span className={liveNetSalary < 0 ? "text-red-400" : "text-emerald-400"}>{formatLKR(liveNetSalary)}</span>
                  </div>
                  {liveNetSalary < 0 && <p className="text-[10px] font-bold text-red-400 mt-2">Deductions exceed earnings — this can't be submitted until fixed.</p>}
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-4 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-70 mt-6 uppercase tracking-widest text-xs">
                  {isSubmitting ? "Validating..." : "Authorize Salary Payout"}
                </button>
              </form>
            </div>
          </div>

          <div className="xl:col-span-2">
            <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-200 overflow-hidden min-h-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <h3 className="text-2xl font-black text-slate-800">Master Salary Ledger</h3>
                <div className="flex items-center gap-2">
                  <SearchInput value={salarySearch} onChange={setSalarySearch} placeholder="Search employee or email..." ariaLabel="Search salary ledger" className="w-56" />
                  <button onClick={() => exportSalariesCSV(filteredSalaries)} disabled={filteredSalaries.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-600 font-bold rounded-xl text-xs transition-colors flex-shrink-0">
                    <IconDownload c="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[700px] overflow-y-auto pr-2">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead className="sticky top-0 bg-white shadow-sm z-10">
                    <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th scope="col" className="py-5 pr-4">Employee Details</th>
                      <th scope="col" className="py-5 pr-4">Period</th>
                      <th scope="col" className="py-5 pr-4">Breakdown</th>
                      <th scope="col" className="py-5 pr-4 text-right">Net Salary</th>
                      <th scope="col" className="py-5 text-right">Dispatch Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                    {salariesPagination.pageItems.map((salary) => (
                      <tr key={salary.salaryId} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="py-5 pr-4">
                          <p className="text-slate-900 font-black">{salary.technicianName}</p>
                          <p className="text-[10px] text-blue-500 font-bold mt-0.5 tracking-wider">{salary.technicianEmail}</p>
                        </td>
                        <td className="py-5 pr-4 font-black text-slate-600 text-xs">{formatMonth(salary.month || salary.payrollMonth)}</td>
                        <td className="py-5 pr-4 text-xs font-mono">
                          <span className="text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold">{salary.hoursWorked ? `${salary.hoursWorked}h` : "0h"}</span>
                          <span className="text-slate-400 mx-1.5">×</span>
                          <span className="text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold">{formatLKR(salary.hourlyRate || 0)}</span>
                        </td>
                        <td className="py-5 pr-4 text-right font-black text-slate-900 text-base">{formatLKR(salary.totalSalary ?? salary.netSalary ?? 0)}</td>
                        <td className="py-5 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleGeneratePdf(salary.salaryId)} disabled={isGeneratingPdf === salary.salaryId}
                              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center gap-1.5">
                              <IconFileText c="w-4 h-4" /> {isGeneratingPdf === salary.salaryId ? "..." : "PDF"}
                            </button>
                            <button onClick={() => handleSendEmail(salary.salaryId)} disabled={isSendingEmail === salary.salaryId || !salary.technicianEmail}
                              className="bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5 active:scale-95">
                              <IconMail c="w-4 h-4" /> {isSendingEmail === salary.salaryId ? "Sending..." : "Email"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {salariesPagination.pageItems.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-16 text-slate-400 font-bold">
                        {salarySearch ? "No records match your search." : "No financial records validated for this quarter."}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationBar pagination={salariesPagination} itemLabel="records" />
            </div>
          </div>
        </div>
      </div>

      {portalTarget && createPortal(
        <>
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

          {confirmState.isOpen && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-payroll-title"
              onKeyDown={(e) => { if (e.key === "Escape" && !confirmState.pending) setConfirmState(CLOSED_CONFIRM); }}>
              <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-sm w-full border border-slate-200 text-center">
                <div className="flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto bg-blue-100 text-blue-600">
                  <IconCheckCircle c="w-6 h-6" />
                </div>
                <h3 id="confirm-payroll-title" className="text-xl font-bold text-slate-900 mb-2">{confirmState.title}</h3>
                <p className="text-slate-500 text-sm mb-6 font-medium">{confirmState.message}</p>
                <div className="flex gap-3">
                  <button ref={cancelButtonRef} onClick={() => setConfirmState(CLOSED_CONFIRM)} disabled={confirmState.pending} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-60">Cancel</button>
                  <button onClick={confirmState.onConfirm} disabled={confirmState.pending} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-slate-900 hover:bg-blue-600 shadow-md disabled:opacity-60">
                    {confirmState.pending ? "Processing..." : confirmState.confirmLabel}
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
