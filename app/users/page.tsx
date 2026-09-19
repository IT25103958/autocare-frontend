"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

interface UserAccount {
  id: number;
  username: string;
  email: string;
  role: string;
  fullName: string;
}

export default function UserManagementDashboard() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Security Alert Modal State
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; type: "error" | "success" }>({
    isOpen: false,
    title: "",
    message: "",
    type: "error"
  });

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  const fetchUsers = async () => {
    try {
      const res = await axios.get("http://localhost:8080/api/auth/all", getAuthHeader());
      setUsers(res.data);
    } catch (err) {
      console.error("Failed to fetch users", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      await axios.put(`http://localhost:8080/api/auth/${userId}/role?role=${newRole}`, {}, getAuthHeader());
      fetchUsers();
      setAlertModal({ isOpen: true, type: "success", title: "Access Updated", message: "User privileges have been successfully modified." });
    } catch (err: any) {
      const errorMessage = err.response?.data || "An unexpected error occurred during role assignment.";
      setAlertModal({ isOpen: true, type: "error", title: "Security Block", message: errorMessage });
      fetchUsers(); // Refresh to revert the UI dropdown if the backend rejected the change
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete the account for ${username}?`)) return;

    try {
      await axios.delete(`http://localhost:8080/api/auth/${userId}`, getAuthHeader());
      fetchUsers();
      setAlertModal({ isOpen: true, type: "success", title: "Account Deleted", message: "The user account has been permanently removed from the system." });
    } catch (err: any) {
      const errorMessage = err.response?.data || "An unexpected error occurred during deletion.";
      setAlertModal({ isOpen: true, type: "error", title: "Action Forbidden", message: errorMessage });
    }
  };

  // STRICT ENTERPRISE RBAC MATRIX
  const systemRoles = [
    { value: "SUPER_ADMIN", label: "Root Super Admin" },
    { value: "EXECUTIVE_OWNER", label: "Executive / Owner" },
    { value: "SYSTEM_ADMIN", label: "System Administrator" },
    { value: "CUSTOMER_RELATIONS_OFFICER", label: "Customer Relations Officer" },
    { value: "INVENTORY_MANAGER", label: "Inventory Manager" },
    { value: "SERVICE_CENTER_MANAGER", label: "Service Center Manager" },
    { value: "FUEL_STATION_SUPERVISOR", label: "Fuel Station Supervisor" },
    { value: "ACCOUNTS_FINANCE_OFFICER", label: "Accounts & Finance Officer" },
    { value: "TECHNICIAN", label: "Service Technician" },
    { value: "SUPPLIER", label: "Supplier" },
    { value: "CUSTOMER", label: "Customer" }
  ];

  if (!isMounted) return null;

  // Global Page Access Guard
  if (currentUser?.role !== 'SUPER_ADMIN' && currentUser?.role !== 'SYSTEM_ADMIN' && currentUser?.role !== 'EXECUTIVE_OWNER') {
    return <div className="p-12 text-center text-red-500 font-bold">Unauthorized Access. Security clearance required.</div>;
  }

  const isReadOnly = currentUser?.role === 'EXECUTIVE_OWNER';

  return (
    <div className="p-4 md:p-8 min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mb-8 max-w-7xl mx-auto">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Access & Security Management</h1>
        <p className="text-slate-500 font-medium mt-1">
          {isReadOnly ? "Viewing system access logs (Read-Only Mode)." : "Manage global system privileges and departmental access."}
        </p>
      </div>

      <div className="max-w-7xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="pb-4 pr-4">User Details</th>
                <th className="pb-4 pr-4">Contact</th>
                <th className="pb-4 pr-4">Current Authority</th>
                <th className="pb-4 text-right">Access Controls</th>
              </tr>
            </thead>
            <tbody className="text-sm font-medium text-slate-700">
              {users.map((u) => {
                // UI Safeguards to prevent obvious invalid actions before hitting the backend
                const isSelf = u.username === currentUser?.username;
                const isTargetRoot = u.role === 'SUPER_ADMIN';
                const isDropdownDisabled = isReadOnly || isSelf || isTargetRoot;
                const isDeleteDisabled = isReadOnly || isSelf || isTargetRoot;

                return (
                  <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 pr-4">
                      <div className="font-bold text-slate-900">{u.fullName} {isSelf && <span className="text-blue-500 text-xs">(You)</span>}</div>
                      <div className="text-xs text-slate-400 mt-0.5 font-mono">@{u.username}</div>
                    </td>
                    <td className="py-4 pr-4 text-slate-600 text-xs">{u.email}</td>
                    <td className="py-4 pr-4">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${
                        u.role === 'SUPER_ADMIN' ? 'bg-red-50 text-red-600 border-red-200' :
                        u.role === 'SYSTEM_ADMIN' || u.role === 'EXECUTIVE_OWNER' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                        'bg-slate-50 text-slate-600 border-slate-200'
                      }`}>
                        {u.role.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex justify-end items-center gap-3">
                        <select
                          className="px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-xs font-bold outline-none focus:border-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          disabled={isDropdownDisabled}
                        >
                          {systemRoles.map(role => (
                            <option key={role.value} value={role.value}>{role.label}</option>
                          ))}
                        </select>

                        <button
                          onClick={() => handleDeleteUser(u.id, u.username)}
                          disabled={isDeleteDisabled}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          title={isDeleteDisabled ? "Action Locked" : "Delete Account"}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- NOTIFICATION MODAL --- */}
      {alertModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-sm w-full border border-slate-200 text-center">
            <div className={`flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto ${alertModal.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              {alertModal.type === 'success' ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              )}
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">{alertModal.title}</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">{alertModal.message}</p>
            <button
              onClick={() => setAlertModal({ ...alertModal, isOpen: false })}
              className={`w-full px-4 py-3 rounded-xl font-bold text-white shadow-md transition-all active:scale-95 ${alertModal.type === 'success' ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-900 hover:bg-slate-800'}`}
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}