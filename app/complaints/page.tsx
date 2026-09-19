"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

interface Customer { customerID: number; name: string; vehicleRegNo: string; }
interface Complaint { ticketId: number; customer: Customer; category: string; issueDescription: string; status: string; assignedStaff: string | null; }

export default function ComplaintsLedger() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  const [staffList, setStaffList] = useState<{name: string, role: string}[]>([
    { name: "Service Center Manager", role: "SERVICE" },
    { name: "Fuel Station Supervisor", role: "FUEL" },
    { name: "Accounts & Finance Officer", role: "FINANCE" },
    { name: "System Admin", role: "WEB" },
    { name: "Customer Relations", role: "GENERAL" }
  ]);

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  const fetchComplaints = async () => {
    try {
      const res = await axios.get("http://localhost:8080/api/complaints", getAuthHeader());
      let data = res.data;

      // ENTERPRISE SMART FILTERING: Department heads only see their own assigned tickets
      if (user?.role === 'ACCOUNTS_FINANCE_OFFICER') {
        data = data.filter((t: Complaint) => t.assignedStaff === "Accounts & Finance Officer");
      } else if (user?.role === 'SERVICE_CENTER_MANAGER') {
        data = data.filter((t: Complaint) => t.assignedStaff === "Service Center Manager");
      } else if (user?.role === 'FUEL_STATION_SUPERVISOR') {
        data = data.filter((t: Complaint) => t.assignedStaff === "Fuel Station Supervisor");
      }
      // CUSTOMER_RELATIONS_OFFICER, SYSTEM_ADMIN, and SUPER_ADMIN bypass the filter and see everything

      const sorted = data.sort((a: Complaint, b: Complaint) =>
          a.status === 'RESOLVED' ? 1 : b.status === 'RESOLVED' ? -1 : 0
      );
      setComplaints(sorted);
    } catch (err) {
      console.error("Failed to fetch complaints data", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    if (user) {
        fetchComplaints();
    }
  }, [user]);

  const handleAssign = async (ticketId: number, staffName: string) => {
    if (!staffName || staffName === "") return;
    try {
      await axios.put(`http://localhost:8080/api/complaints/${ticketId}/assign?staffName=${staffName}`, {}, getAuthHeader());
      fetchComplaints();
    } catch (err) { console.error(err); }
  };

  const handleResolve = async (ticketId: number) => {
    try {
      await axios.put(`http://localhost:8080/api/complaints/${ticketId}/resolve`, {}, getAuthHeader());
      fetchComplaints();
    } catch (err) { console.error(err); }
  };

  const handleReopen = async (ticketId: number) => {
    try {
      await axios.put(`http://localhost:8080/api/complaints/${ticketId}/reopen`, {}, getAuthHeader());
      fetchComplaints();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (ticketId: number) => {
    if(!confirm("Are you sure you want to permanently delete this ticket?")) return;
    try {
      await axios.delete(`http://localhost:8080/api/complaints/${ticketId}`, getAuthHeader());
      fetchComplaints();
    } catch (err) { console.error(err); }
  };

  const getCategoryBadge = (category: string) => {
    switch (category?.toUpperCase()) {
      case "FUEL": return <span className="bg-orange-100 text-orange-700 border-orange-200 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border">Fuel Dept</span>;
      case "FINANCE": return <span className="bg-emerald-100 text-emerald-700 border-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border">Finance Dept</span>;
      case "SERVICE": return <span className="bg-blue-100 text-blue-700 border-blue-200 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border">Service Dept</span>;
      case "WEB": return <span className="bg-purple-100 text-purple-700 border-purple-200 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border">IT Dept</span>;
      default: return <span className="bg-slate-100 text-slate-700 border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border">General</span>;
    }
  };

  if (!isMounted) return null;

  return (
    <div className="p-4 md:p-8 min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mb-8 max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">CRM Ticketing Desk</h1>
          <p className="text-slate-500 font-medium mt-1">Oversee smart-routed customer tickets and monitor departmental resolution times.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-8 py-4">Customer Details</th>
                  <th className="px-8 py-4">Reported Issue & Category</th>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4">Department Routing</th>
                  <th className="px-8 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm font-medium text-slate-700">
                {complaints.map((ticket) => (
                  <tr key={ticket.ticketId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">

                    <td className="px-8 py-5">
                      <div className="font-bold text-slate-900">{ticket.customer?.name}</div>
                      <div className="text-xs text-blue-600 font-bold inline-block mt-1 font-mono">
                        {ticket.customer?.vehicleRegNo}
                      </div>
                    </td>

                    <td className="px-8 py-5 text-sm leading-relaxed">
                      <div className="mb-1">{getCategoryBadge(ticket.category || "GENERAL")}</div>
                      <div className="max-w-[300px] truncate whitespace-normal text-slate-600">
                        {ticket.issueDescription}
                      </div>
                    </td>

                    <td className="px-8 py-5">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        ticket.status === 'OPEN' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                        ticket.status === 'RESOLVED' ? 'bg-green-50 text-green-700 border border-green-200' :
                        'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="px-8 py-5">
                      {ticket.assignedStaff ? (
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-xs font-bold text-white shadow-sm">
                            {ticket.assignedStaff.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm">{ticket.assignedStaff}</div>
                            <div className="text-[9px] font-bold text-blue-500 uppercase tracking-wider flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                              Auto-Routed
                            </div>
                          </div>
                        </div>
                      ) : (
                        <select
                          onChange={(e) => handleAssign(ticket.ticketId, e.target.value)}
                          className="w-full max-w-[200px] px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-xs font-bold outline-none focus:bg-white focus:border-blue-500 cursor-pointer text-slate-700"
                        >
                          <option value="">Manual Triage...</option>
                          {staffList.map((staff, idx) => (
                            <option key={idx} value={staff.name}>{staff.name}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    <td className="px-8 py-5 text-right flex justify-end items-center gap-2">
                      {/* FIX: Allow resolving if status is IN_PROGRESS OR OPEN */}
                      {(ticket.status === 'IN_PROGRESS' || ticket.status === 'OPEN') && (
                        <button onClick={() => handleResolve(ticket.ticketId)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-700 shadow-sm transition-colors flex items-center gap-1.5">
                          Mark Resolved
                        </button>
                      )}
                      {ticket.status === 'RESOLVED' && (
                        <button onClick={() => handleReopen(ticket.ticketId)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-colors flex items-center gap-1.5">
                          Reopen
                        </button>
                      )}

                      {/* Optional: Restrict delete to Admin/CRO roles only to prevent accidental deletions by department heads */}
                      {(user?.role === 'CUSTOMER_RELATIONS_OFFICER' || user?.role === 'SYSTEM_ADMIN' || user?.role === 'SUPER_ADMIN') && (
                        <button onClick={() => handleDelete(ticket.ticketId)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-1" title="Delete Ticket">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </td>

                  </tr>
                ))}
                {complaints.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-slate-500 font-medium">No tickets found in the system.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}