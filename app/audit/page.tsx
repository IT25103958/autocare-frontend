"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";

interface AuditLog {
  id: number;
  action: string;
  description: string;
  performedBy: string;
  timestamp: string;
}

type TabCategory = "ALL" | "AUTH" | "FINANCE" | "SUPPORT" | "SYSTEM";

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<TabCategory>("ALL");
  const [purgeDays, setPurgeDays] = useState("7");
  const [isPurging, setIsPurging] = useState(false);
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }

    if (user && !["SUPER_ADMIN", "SYSTEM_ADMIN", "EXECUTIVE_OWNER"].includes(user.role)) {
      router.push("/dashboard");
      return;
    }

    const fetchLogs = async () => {
      try {
        const token = localStorage.getItem("jwtToken");
        const response = await axios.get("http://localhost:8080/api/audit", {
          headers: { Authorization: `Bearer ${token}` }
        });
        setLogs(response.data);
      } catch (error) {
        console.error("Failed to fetch audit logs:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user) fetchLogs();
  }, [user, authLoading, router]);

  const handlePurge = async () => {
    if (!window.confirm(`SECURITY WARNING: Are you sure you want to permanently destroy all audit logs older than ${purgeDays} days? This action will be recorded.`)) return;

    setIsPurging(true);
    try {
      const token = localStorage.getItem("jwtToken");
      await axios.delete(`http://localhost:8080/api/audit/purge?days=${purgeDays}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const response = await axios.get("http://localhost:8080/api/audit", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(response.data);
    } catch (error) {
      console.error("Purge failed:", error);
      alert("Failed to purge logs.");
    } finally {
      setIsPurging(false);
    }
  };

  const getActionBadge = (action: string) => {
    if (action.includes("DELETE") || action.includes("FAIL") || action.includes("PURGE")) return "bg-red-500/10 text-red-700 border-red-500/20";
    if (action.includes("SUCCESS") || action.includes("RESOLVED")) return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
    if (action.includes("MODIFIED") || action.includes("ASSIGNED") || action.includes("SUBMITTED")) return "bg-blue-500/10 text-blue-700 border-blue-500/20";
    if (action.includes("CHECKOUT")) return "bg-amber-500/10 text-amber-700 border-amber-500/20";
    return "bg-slate-500/10 text-slate-700 border-slate-500/20";
  };

  const getCategorizedLogs = () => {
    return logs.filter(log => {
      const act = log.action.toUpperCase();
      if (activeTab === "AUTH") return act.includes("LOGIN") || act.includes("REGISTER");
      if (activeTab === "FINANCE") return act.includes("POS") || act.includes("CHECKOUT");
      if (activeTab === "SUPPORT") return act.includes("TICKET");
      if (activeTab === "SYSTEM") return act.includes("ROLE") || act.includes("USER_DELETED") || act.includes("PURGE");
      return true;
    });
  };

  const currentLogs = getCategorizedLogs().filter(log =>
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.performedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tabs: { id: TabCategory; label: string }[] = [
    { id: "ALL", label: "All Events" },
    { id: "AUTH", label: "Authentication" },
    { id: "FINANCE", label: "Finance & Retail" },
    { id: "SUPPORT", label: "Support CRM" },
    { id: "SYSTEM", label: "System Admin" }
  ];

  if (authLoading || isLoading) {
    return (
      <div className="min-h-[calc(100vh-72px)] bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-800 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-slate-400 font-bold text-sm tracking-widest uppercase">Decrypting Ledger...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-slate-50 p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* --- HEADER DASHBOARD CARD --- */}
        <div className="bg-white p-6 lg:p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col gap-6">

          {/* Top Row: Titles & Info */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-4">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">System Audit Log</h1>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/80 border border-blue-100 rounded-lg">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">30-Day Retention</span>
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-500 max-w-3xl leading-relaxed">
              Immutable record of enterprise actions and security events. <span className="font-normal italic text-slate-400">Logs are automatically purged after 30 days to maintain database performance.</span>
            </p>
          </div>

          <hr className="border-slate-100" />

          {/* Bottom Row: Search & Purge Tools */}
          <div className="flex flex-col lg:flex-row justify-between items-center gap-4 w-full">

            {/* SEARCH BAR */}
            <div className="relative w-full flex-1">
              <svg className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search events by action type, username, or detailed signature..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-slate-800 focus:ring-4 focus:ring-slate-800/10 text-sm font-bold text-slate-800 transition-all shadow-sm"
              />
            </div>

            {/* MANUAL PURGE CONTROLS */}
            {user && ["SUPER_ADMIN", "EXECUTIVE_OWNER"].includes(user.role) && (
              <div className="flex items-center gap-2 p-1.5 bg-red-50 border border-red-100 rounded-xl w-full lg:w-auto shrink-0">
                <div className="flex items-center pl-2">
                  <svg className="w-4 h-4 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <select
                    value={purgeDays}
                    onChange={(e) => setPurgeDays(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold text-red-900 outline-none pr-4 py-1.5 cursor-pointer focus:ring-0 appearance-none"
                  >
                    <option value="7">Older than 1 Week</option>
                    <option value="14">Older than 2 Weeks</option>
                    <option value="21">Older than 3 Weeks</option>
                    <option value="30">Older than 1 Month</option>
                  </select>
                </div>
                <button
                  onClick={handlePurge}
                  disabled={isPurging}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider rounded-lg shadow-sm transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {isPurging ? 'Purging...' : 'Force Purge'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* --- TABS --- */}
        <div className="flex overflow-x-auto gap-2 pb-2 mask-edges">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white shadow-md shadow-slate-900/10"
                  : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-sm"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* --- SECURE DATA TABLE --- */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-widest font-black">
                  <th className="p-5 rounded-tl-3xl">Timestamp</th>
                  <th className="p-5">Actor</th>
                  <th className="p-5">Action Type</th>
                  <th className="p-5 rounded-tr-3xl">Event Signature</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 mb-3">
                        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-slate-500 text-sm font-bold">No security events found in this category.</p>
                    </td>
                  </tr>
                ) : (
                  currentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-5 whitespace-nowrap text-xs font-bold text-slate-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="p-5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-3">
                          {/* FIXED: Smaller, strict square avatar (w-6 h-6, rounded) */}
                          <div className="w-6 h-6 rounded bg-slate-800 text-white flex items-center justify-center text-[10px] font-black uppercase shadow-sm shrink-0">
                            {log.performedBy.substring(0, 2)}
                          </div>
                          <span className="text-sm font-black text-slate-900">{log.performedBy}</span>
                        </div>
                      </td>
                      <td className="p-5 whitespace-nowrap">
                        <span className={`px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md border ${getActionBadge(log.action)}`}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-5 text-sm font-semibold text-slate-600 max-w-lg truncate group-hover:whitespace-normal group-hover:break-words transition-all leading-relaxed">
                        {log.description}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}