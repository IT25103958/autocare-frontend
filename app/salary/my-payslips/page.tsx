"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../../context/AuthContext";

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
  const { user } = useAuth();
  const [salaries, setSalaries] = useState<PersonalSalary[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    const fetchMySalaries = async () => {
      try {
        const res = await axios.get("http://localhost:8080/api/salary/my-salary", {
          headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` }
        });
        setSalaries(res.data);
      } catch (err) {
        console.error("Failed to fetch salary history", err);
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchMySalaries();
  }, [user]);

  const handleDownloadPdf = async (salaryId: number) => {
    setDownloadingId(salaryId);
    try {
      const response = await axios.get(`http://localhost:8080/api/salary/${salaryId}/payslip`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Official_Payslip_${salaryId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      alert("Failed to securely generate PDF.");
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

  if (loading) return <div className="p-12 text-center text-slate-400 font-bold">Loading your financial ledger...</div>;

  return (
    <div className="p-6 lg:p-12 max-w-5xl mx-auto space-y-8 min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="bg-slate-900 p-8 rounded-[2rem] shadow-xl text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">My Salary & Payment History</h1>
          <p className="text-slate-400 font-medium mt-1">Review all authorized payroll disbursements and download official PDF statements.</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl text-xs font-bold text-slate-300">
          Account: {user?.sub || user?.username}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest font-black border-b border-slate-200">
                <th className="p-5">Billing Period</th>
                <th className="p-5">Hours Logged</th>
                <th className="p-5">Hourly Rate</th>
                <th className="p-5 text-right">Net Payout</th>
                <th className="p-5 text-center">Official Document</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
              {salaries.map(salary => (
                <tr key={salary.salaryId} className="hover:bg-slate-50 transition-colors">
                  <td className="p-5 font-black text-slate-900">{formatMonth(salary.month || salary.payrollMonth || '')}</td>
                  <td className="p-5 font-bold text-slate-600">{salary.hoursWorked} hrs</td>
                  <td className="p-5 text-slate-500">Rs. {salary.hourlyRate?.toLocaleString()}</td>
                  <td className="p-5 text-right font-black text-emerald-600">Rs. {(salary.totalSalary || salary.netSalary || 0).toLocaleString()}</td>
                  <td className="p-5 text-center">
                    <button
                      onClick={() => handleDownloadPdf(salary.salaryId)}
                      disabled={downloadingId === salary.salaryId}
                      className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      {downloadingId === salary.salaryId ? "Rendering..." : "Download PDF"}
                    </button>
                  </td>
                </tr>
              ))}
              {salaries.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400 font-medium">
                    No payroll disbursements have been authorized for your account yet.
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