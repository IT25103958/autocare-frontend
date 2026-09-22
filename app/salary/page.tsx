"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const payrollSchema = z.object({
  technicianName: z.string().min(2, "Please select an employee from the secure database."),
  technicianEmail: z.string().email("A valid email is required for secure PDF dispatch."),
  month: z.string()
    .regex(/^\d{4}-\d{2}$/, "Invalid date format.")
    .refine((val) => {
      const selected = new Date(val);
      const current = new Date();
      return selected <= current;
    }, "Cannot process payroll for future months."),
  hoursWorked: z.coerce.number()
    .min(0, "Hours cannot be negative.")
    .max(350, "Exceeds max allowable monthly limit (350h)."),
  hourlyRate: z.coerce.number()
    .min(100, "Violates minimum wage policy.")
    .max(20000, "Exceeds standard rate limits."),
  allowances: z.coerce.number().min(0).default(0),
  deductions: z.coerce.number().min(0).default(0),
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

interface UserAccount {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: string;
}

export default function SalaryDashboard() {
  const [salaries, setSalaries] = useState<TechnicianSalary[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<number | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<PayrollFormInputs>({
    resolver: zodResolver(payrollSchema),
    mode: "onChange",
    defaultValues: { hourlyRate: 850, hoursWorked: 0, allowances: 0, deductions: 0 }
  });

  const selectedEmployee = watch("technicianName");
  const selectedMonth = watch("month");

  const currentHours = parseFloat(watch("hoursWorked") as any) || 0;
  const currentRate = parseFloat(watch("hourlyRate") as any) || 0;
  const currentAllowances = parseFloat(watch("allowances") as any) || 0;
  const currentDeductions = parseFloat(watch("deductions") as any) || 0;
  const liveNetSalary = (currentHours * currentRate) + currentAllowances - currentDeductions;

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  useEffect(() => {
    setIsMounted(true);
    const initializeData = async () => {
      try {
        const [salaryRes, userRes] = await Promise.all([
          axios.get("http://localhost:8080/api/salary", getAuthHeader()),
          axios.get("http://localhost:8080/api/auth/all", getAuthHeader())
        ]);
        setSalaries(salaryRes.data.sort((a: any, b: any) => b.salaryId - a.salaryId));

        // EXCLUDE CUSTOMERS, SUPER_ADMINS, EXECUTIVE_OWNERS, AND SYSTEM_ADMINS FROM PAYROLL
        const eligibleStaff = userRes.data.filter((u: UserAccount) =>
          u.role !== 'CUSTOMER' &&
          u.role !== 'SUPER_ADMIN' &&
          u.role !== 'EXECUTIVE_OWNER' &&
          u.role !== 'SYSTEM_ADMIN'
        );
        setUsers(eligibleStaff);
      } catch (err) {
        console.error("Failed to fetch system data", err);
      }
    };
    initializeData();
  }, []);

  useEffect(() => {
    const syncEmployeeData = async () => {
      if (!selectedEmployee) return;

      const employee = users.find(u => u.username === selectedEmployee);
      if (employee) {
        setValue("technicianEmail", employee.email || `${employee.username}@lankaauto.com`);

        let rate = 850;
        if (employee.role === 'SERVICE_CENTER_MANAGER') rate = 1500;
        if (employee.role === 'ACCOUNTS_FINANCE_OFFICER') rate = 1200;
        setValue("hourlyRate", rate);
      }

      if (selectedMonth && employee) {
        try {
          const shiftRes = await axios.get(`http://localhost:8080/api/roster/staff/${employee.username}`, getAuthHeader());
          const validShifts = shiftRes.data.filter((s: any) => s.shiftDate && s.shiftDate.startsWith(selectedMonth));
          const totalCalculatedHours = validShifts.length * 8; // 1 Shift = 8 Hours
          setValue("hoursWorked", totalCalculatedHours);
        } catch (error) {
          console.error("Failed to sync timesheets from Roster");
        }
      }
    };

    syncEmployeeData();
  }, [selectedEmployee, selectedMonth, users, setValue]);

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

      const salaryRes = await axios.get("http://localhost:8080/api/salary", getAuthHeader());
      setSalaries(salaryRes.data.sort((a: any, b: any) => b.salaryId - a.salaryId));

      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } catch (err: any) {
      const errorResponse = err.response?.data;
      const errorMessage = typeof errorResponse === 'string' ? errorResponse : (errorResponse?.message || "");

      if (errorMessage.includes("already been processed")) {
        setServerMessage({ type: "error", text: "Fraud Alert: Employee already processed for this period." });
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
      alert("Failed to securely generate PDF.");
    } finally {
      setIsGeneratingPdf(null);
    }
  };

  const handleSendEmail = async (salaryId: number) => {
    setIsSendingEmail(salaryId);
    try {
      await axios.post(`http://localhost:8080/api/salary/${salaryId}/send-email`, {}, getAuthHeader());
      alert("Payslip dispatched to employee securely.");
    } catch (err) {
      alert("SMTP Dispatch Failed. Verify backend mail configurations.");
    } finally {
      setIsSendingEmail(null);
    }
  };

  const formatMonth = (monthString: string) => {
    if (!monthString) return "N/A";
    if (/^\d{4}-\d{2}$/.test(monthString)) {
      const [year, month] = monthString.split("-");
      return new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    }
    const parsedDate = new Date(monthString);
    return !isNaN(parsedDate.getTime()) ? parsedDate.toLocaleString('default', { month: 'long', year: 'numeric' }) : monthString;
  };

  if (!isMounted) return null;

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)]">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Global Payroll & Commissions</h1>
        <p className="text-slate-500 font-medium mt-1">Cross-reference manager rosters, calculate monthly salaries, and dispatch secure payslips.</p>
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
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Select Employee</label>
                <select
                  {...register("technicianName")}
                  className={`w-full px-4 py-3 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all font-bold cursor-pointer ${
                    errors.technicianName ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
                  }`}
                >
                  <option value="">-- Select from Database --</option>
                  {users.map(user => (
                    <option key={user.id} value={user.username}>
                      {user.fullName || user.username} ({user.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
                {errors.technicianName && <p className="mt-1 text-xs font-bold text-red-500">{errors.technicianName.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Official Email</label>
                <input {...register("technicianEmail")} type="email" readOnly className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 font-medium outline-none cursor-not-allowed" />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Payroll Month</label>
                <input {...register("month")} type="month" className={`w-full px-4 py-3 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all font-bold ${errors.month ? "border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"}`} />
                <p className="text-[10px] font-bold text-blue-500 mt-1.5">Select month to auto-sync hours from Roster.</p>
                {errors.month && <p className="mt-1 text-xs font-bold text-red-500">{errors.month.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Hours Worked</label>
                  <input {...register("hoursWorked")} type="number" step="0.5" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-black text-blue-700" />
                  {errors.hoursWorked && <p className="mt-1 text-xs font-bold text-red-500">{errors.hoursWorked.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Rate / Hr (LKR)</label>
                  <input {...register("hourlyRate")} type="number" step="0.01" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-bold" />
                  {errors.hourlyRate && <p className="mt-1 text-xs font-bold text-red-500">{errors.hourlyRate.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Allowances (+)</label>
                  <input {...register("allowances")} type="number" step="0.01" className="w-full px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 outline-none font-bold text-emerald-700" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Deductions (-)</label>
                  <input {...register("deductions")} type="number" step="0.01" className="w-full px-4 py-3 rounded-xl border border-red-200 bg-red-50 outline-none font-bold text-red-700" />
                </div>
              </div>

              <div className="bg-slate-900 text-white rounded-2xl p-5 mt-6 shadow-xl">
                <div className="flex justify-between text-sm mb-2 font-medium">
                  <span className="text-slate-400">Base Salary</span>
                  <span>Rs. {(currentHours * currentRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-xl font-black border-t border-slate-700 pt-3 mt-1">
                  <span>Net Payout</span>
                  <span className={liveNetSalary < 0 ? "text-red-400" : "text-emerald-400"}>
                    Rs. {Math.max(0, liveNetSalary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-4 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-70 mt-6 uppercase tracking-widest text-xs">
                {isSubmitting ? "Authenticating Ledger..." : "Authorize Salary Payout"}
              </button>

              {serverMessage.text && (
                <div className={`mt-4 p-4 rounded-xl text-sm font-bold text-center border ${serverMessage.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                  {serverMessage.text}
                </div>
              )}
            </form>
          </div>
        </div>

        <div className="xl:col-span-2">
          <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-200 overflow-hidden min-h-full">
            <h3 className="text-2xl font-black text-slate-800 mb-8">Master Salary Ledger</h3>

            <div className="overflow-x-auto max-h-[800px] overflow-y-auto pr-4">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="sticky top-0 bg-white shadow-sm z-10">
                  <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="py-5 pr-4">Employee Details</th>
                    <th className="py-5 pr-4">Period</th>
                    <th className="py-5 pr-4">Breakdown</th>
                    <th className="py-5 pr-4 text-right">Net Salary</th>
                    <th className="py-5 text-right">Dispatch Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                  {salaries.map((salary: any) => (
                    <tr key={salary.salaryId} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="py-5 pr-4">
                        <p className="text-slate-900 font-black">{salary.technicianName}</p>
                        <p className="text-[10px] text-blue-500 font-bold mt-0.5 tracking-wider">{salary.technicianEmail}</p>
                      </td>
                      <td className="py-5 pr-4 font-black text-slate-600 text-xs">
                        {formatMonth(salary.month || salary.payrollMonth)}
                      </td>
                      <td className="py-5 pr-4 text-xs font-mono">
                        <span className="text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold">{salary.hoursWorked ? `${salary.hoursWorked}h` : '0h'}</span>
                        <span className="text-slate-400 mx-1.5">×</span>
                        <span className="text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold">Rs. {(salary.hourlyRate || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </td>
                      <td className="py-5 pr-4 text-right font-black text-slate-900 text-base">
                        Rs. {(salary.totalSalary || salary.netSalary || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleGeneratePdf(salary.salaryId)} disabled={isGeneratingPdf === salary.salaryId} className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            {isGeneratingPdf === salary.salaryId ? "..." : "PDF"}
                          </button>
                          <button onClick={() => handleSendEmail(salary.salaryId)} disabled={isSendingEmail === salary.salaryId || !salary.technicianEmail} className="bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5 active:scale-95">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            {isSendingEmail === salary.salaryId ? "Sending..." : "Email"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {salaries.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-16 text-slate-400 font-bold">No financial records validated for this quarter.</td></tr>
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