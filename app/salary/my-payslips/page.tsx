"use client";

import { useState, useEffect } from "react";
import api from "../../../utils/axiosInstance";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";

interface PersonalSalary {
  salaryId: number;
  month: string;
  payrollMonth?: string;
  totalSalary: number;
  netSalary?: number;
  hoursWorked: number;
  hourlyRate: number;
  technicianName: string;
  technicianEmail: string;
}

export default function MyPayslipsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [salaries, setSalaries] = useState<PersonalSalary[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    const fetchMySalaries = async () => {
      try {
        const res = await api.get("/salary/my-salary");
        setSalaries(res.data);
      } catch (err) {
        console.error("Failed to fetch salary history", err);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchMySalaries();
    }
  }, [user]);

  const handleDownloadPdf = async (salaryId: number) => {
    setDownloadingId(salaryId);
    try {
      const response = await api.get(`/salary/${salaryId}/payslip`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Official_Payslip_${salaryId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch {
      alert("Couldn't download the payslip. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  };

  const formatMonth = (monthString: string) => {
    if (!monthString) return "N/A";
    if (/^\d{4}-\d{2}$/.test(monthString)) {
      const [year, month] = monthString.split("-");
      return new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    }
    return monthString;
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-slate-400 font-black text-xs uppercase tracking-widest">Decrypting Ledger...</div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="p-6 lg:p-12 max-w-5xl mx-auto space-y-8 min-h-[calc(100vh-4rem)] bg-slate-50 animate-fade-in-up">
      <div className="bg-slate-900 p-8 rounded-[2rem] shadow-xl text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl font-black tracking-tight">My Salary & Payment History</h1>
          <p className="text-slate-400 font-medium mt-1">Review all authorized payroll disbursements and download official statements.</p>
        </div>
        <div className="relative z-10 bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl text-xs font-black tracking-widest uppercase text-slate-300">
          Account ID: {user.username}
        </div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-200">
                <th className="p-6">Billing Period</th>
                <th className="p-6">Hours Logged</th>
                <th className="p-6">Hourly Rate</th>
                <th className="p-6 text-right">Net Payout</th>
                <th className="p-6 text-center">Official Document</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
              {salaries.map(salary => (
                <tr key={salary.salaryId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-6 font-black text-slate-900">{formatMonth(salary.month || salary.payrollMonth || '')}</td>
                  <td className="p-6 font-bold text-slate-600">
                    <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-xs">{salary.hoursWorked} hrs</span>
                  </td>
                  <td className="p-6 text-slate-500 font-bold">Rs. {salary.hourlyRate?.toLocaleString()}</td>
                  <td className="p-6 text-right font-black text-emerald-600 text-base">Rs. {(salary.totalSalary || salary.netSalary || 0).toLocaleString()}</td>
                  <td className="p-6 text-center">
                    <button
                      onClick={() => handleDownloadPdf(salary.salaryId)}
                      disabled={downloadingId === salary.salaryId}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm disabled:opacity-50 inline-flex items-center gap-2 active:scale-95"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      {downloadingId === salary.salaryId ? "Rendering..." : "Download PDF"}
                    </button>
                  </td>
                </tr>
              ))}
              {salaries.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-16 text-center text-slate-400">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <p className="font-bold text-sm">No payroll disbursements have been authorized for your account yet.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}