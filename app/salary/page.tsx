"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// --- 1. ENTERPRISE ZOD SCHEMA ---
const payrollSchema = z.object({
  technicianName: z.string()
    .regex(/^[a-zA-Z\s]+$/, "Name can only contain letters and spaces.")
    .min(2, "Name must be at least 2 characters.")
    .max(100, "Name exceeds maximum length limit."),
  technicianEmail: z.string()
    .email("A valid email is strictly required for PDF dispatch."),
  month: z.string()
    .regex(/^\d{4}-\d{2}$/, "Invalid date format.")
    .refine((val) => {
      const selected = new Date(val);
      const current = new Date();
      return selected <= current;
    }, "Cannot process payroll for future months."),
  hoursWorked: z.coerce.number()
    .min(1, "Hours must be greater than 0.")
    .max(350, "Exceeds max allowable monthly limit (350h)."),
  hourlyRate: z.coerce.number()
    .min(100, "Violates minimum wage policy.")
    .max(20000, "Exceeds standard rate limits."),
  allowances: z.coerce.number()
    .min(0, "Allowances cannot be negative.").default(0),
  deductions: z.coerce.number()
    .min(0, "Deductions cannot be negative.").default(0),
});

type PayrollFormInputs = z.infer<typeof payrollSchema>;

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

export default function SalaryDashboard() {
  const [salaries, setSalaries] = useState<TechnicianSalary[]>([]);
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<number | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PayrollFormInputs>({
    resolver: zodResolver(payrollSchema),
    mode: "onChange",
    defaultValues: {
      hourlyRate: 850,
      hoursWorked: 160,
      allowances: 0,
      deductions: 0,
    }
  });

  const currentHours = parseFloat(watch("hoursWorked") as any) || 0;
  const currentRate = parseFloat(watch("hourlyRate") as any) || 0;
  const currentAllowances = parseFloat(watch("allowances") as any) || 0;
  const currentDeductions = parseFloat(watch("deductions") as any) || 0;
  const liveNetSalary = (currentHours * currentRate) + currentAllowances - currentDeductions;

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` }
  });

  const fetchSalaries = async () => {
    try {
      const response = await axios.get("http://localhost:8080/api/salary", getAuthHeader());
      const sorted = response.data.sort((a: TechnicianSalary, b: TechnicianSalary) => b.salaryId - a.salaryId);
      setSalaries(sorted);
    } catch (err) {
      console.error("Failed to fetch salaries", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchSalaries();
  }, []);

  const onSubmit = async (data: PayrollFormInputs) => {
    setServerMessage({ type: "", text: "" });

    try {
      const basePay = data.hourlyRate * data.hoursWorked;
      const netSalary = basePay + data.allowances - data.deductions;

      const payload = {
        technicianName: data.technicianName,
        technicianEmail: data.technicianEmail,
        month: data.month,
        hoursWorked: data.hoursWorked,
        hourlyRate: data.hourlyRate,
        totalSalary: netSalary
      };

      await axios.post("http://localhost:8080/api/salary/process", payload, getAuthHeader());

      setServerMessage({ type: "success", text: "Payroll successfully validated & processed." });
      reset();
      fetchSalaries();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } catch (err: any) {
      console.error(err);

      // ENTERPRISE FIX: Safely parse the raw string response from Spring Boot
      const errorResponse = err.response?.data;
      const errorMessage = typeof errorResponse === 'string' ? errorResponse : (errorResponse?.message || "");

      if (errorMessage.includes("already been processed")) {
        setServerMessage({ type: "error", text: "Fraud Alert: Technician already processed for this period." });
      } else {
        setServerMessage({ type: "error", text: errorMessage || "Payroll calculation failed. Review inputs." });
      }
    }
  };

  const handleGeneratePdf = async (salaryId: number) => {
    setIsGeneratingPdf(salaryId);
    try {
      const response = await axios.get(`http://localhost:8080/api/salary/${salaryId}/payslip`, {
        ...getAuthHeader(),
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `LankaAutoCare_Payslip_${salaryId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      console.error("PDF download failed", err);
      alert("Failed to securely generate PDF.");
    } finally {
      setIsGeneratingPdf(null);
    }
  };

  const handleSendEmail = async (salaryId: number) => {
    setIsSendingEmail(salaryId);
    try {
      await axios.post(`http://localhost:8080/api/salary/${salaryId}/send-email`, {}, getAuthHeader());
      alert("Payslip dispatched to technician securely.");
    } catch (err) {
      console.error("Email dispatch failed", err);
      alert("SMTP Dispatch Failed. Verify backend mail configurations.");
    } finally {
      setIsSendingEmail(null);
    }
  };

  const formatMonth = (monthString: string) => {
    if (!monthString) return "N/A";

    if (/^\d{4}-\d{2}$/.test(monthString)) {
      const [year, month] = monthString.split("-");
      const date = new Date(Number(year), Number(month) - 1);
      return date.toLocaleString('default', { month: 'long', year: 'numeric' });
    }

    const parsedDate = new Date(monthString);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    }

    return monthString;
  };

  if (!isMounted) return null;

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)]">

      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Payroll & Commissions</h1>
        <p className="text-slate-500 font-medium mt-1">Calculate monthly salaries, generate PDF pay slips, and email them to technicians.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        <div className="xl:col-span-1">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Process Salary</h2>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Technician Name</label>
                <input
                  {...register("technicianName")}
                  type="text"
                  placeholder="e.g., Kamal Perera"
                  className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${
                    errors.technicianName ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
                  }`}
                />
                {errors.technicianName && <p className="mt-1 text-xs font-bold text-red-500">{errors.technicianName.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Technician Email</label>
                <input
                  {...register("technicianEmail")}
                  type="email"
                  placeholder="kamal@lankaauto.com"
                  className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${
                    errors.technicianEmail ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
                  }`}
                />
                {errors.technicianEmail && <p className="mt-1 text-xs font-bold text-red-500">{errors.technicianEmail.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Payroll Month</label>
                <input
                  {...register("month")}
                  type="month"
                  className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${
                    errors.month ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
                  }`}
                />
                {errors.month && <p className="mt-1 text-xs font-bold text-red-500">{errors.month.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Hours Worked</label>
                  <input
                    {...register("hoursWorked")}
                    type="number"
                    step="0.5"
                    className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${
                      errors.hoursWorked ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
                    }`}
                  />
                  {errors.hoursWorked && <p className="mt-1 text-xs font-bold text-red-500">{errors.hoursWorked.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Rate / Hr (LKR)</label>
                  <input
                    {...register("hourlyRate")}
                    type="number"
                    step="0.01"
                    className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${
                      errors.hourlyRate ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
                    }`}
                  />
                  {errors.hourlyRate && <p className="mt-1 text-xs font-bold text-red-500">{errors.hourlyRate.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 mt-2">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Allowances (+)</label>
                  <input
                    {...register("allowances")}
                    type="number"
                    step="0.01"
                    className={`w-full px-4 py-2.5 rounded-xl border bg-green-50/50 focus:bg-white focus:ring-4 outline-none transition-all ${
                      errors.allowances ? "border-red-500" : "border-green-200 focus:border-green-500 focus:ring-green-500/10"
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Deductions (-)</label>
                  <input
                    {...register("deductions")}
                    type="number"
                    step="0.01"
                    className={`w-full px-4 py-2.5 rounded-xl border bg-red-50/50 focus:bg-white focus:ring-4 outline-none transition-all ${
                      errors.deductions ? "border-red-500" : "border-red-200 focus:border-red-500 focus:ring-red-500/10"
                    }`}
                  />
                </div>
              </div>

              <div className="bg-slate-900 text-white rounded-xl p-4 mt-4 shadow-inner">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Base Salary</span>
                  <span>Rs. {(currentHours * currentRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-lg font-black border-t border-slate-700 pt-2 mt-2">
                  <span>Net Payout</span>
                  <span className={liveNetSalary < 0 ? "text-red-400" : "text-green-400"}>
                    Rs. {Math.max(0, liveNetSalary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all transform hover:-translate-y-0.5 disabled:opacity-70 mt-4"
              >
                {isSubmitting ? "Authenticating Ledger..." : "Authorize Salary Payout"}
              </button>

              {serverMessage.text && (
                <div className={`mt-4 p-3 rounded-xl text-sm font-bold text-center border ${
                  serverMessage.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                }`}>
                  {serverMessage.text}
                </div>
              )}
            </form>
          </div>
        </div>

        <div className="xl:col-span-2">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-full">
            <h3 className="text-xl font-bold text-slate-800 mb-6">Recent Salary Statements</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="pb-4 pr-4">Technician Details</th>
                    <th className="pb-4 pr-4">Period</th>
                    <th className="pb-4 pr-4">Breakdown</th>
                    <th className="pb-4 pr-4 text-right">Net Salary</th>
                    <th className="pb-4 text-right">Dispatch Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-slate-700">
                  {salaries.map((salary: any) => (
                    <tr key={salary.salaryId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 pr-4">
                        <p className="text-slate-900 font-bold">{salary.technicianName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{salary.technicianEmail || 'No Email'}</p>
                      </td>
                      <td className="py-4 pr-4 font-bold text-slate-600 text-xs">
                        {formatMonth(salary.month || salary.payrollMonth)}
                      </td>
                      <td className="py-4 pr-4 text-xs font-mono">
                        <span className="text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{salary.hoursWorked ? `${salary.hoursWorked}h` : '0h'}</span>
                        <span className="text-slate-400 mx-1">×</span>
                        <span className="text-slate-500 bg-slate-100 px-2 py-1 rounded-md">Rs. {(salary.hourlyRate || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </td>
                      <td className="py-4 pr-4 text-right font-black text-slate-900">
                        Rs. {(salary.totalSalary || salary.netSalary || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleGeneratePdf(salary.salaryId)}
                            disabled={isGeneratingPdf === salary.salaryId}
                            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            {isGeneratingPdf === salary.salaryId ? "..." : "PDF"}
                          </button>

                          <button
                            onClick={() => handleSendEmail(salary.salaryId)}
                            disabled={isSendingEmail === salary.salaryId || !salary.technicianEmail}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5 active:scale-95"
                            title={!salary.technicianEmail ? "No email on file" : "Email Secure Payslip"}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            {isSendingEmail === salary.salaryId ? "Sending..." : "Email"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {salaries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-500 font-medium">
                        No financial records validated for this quarter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}