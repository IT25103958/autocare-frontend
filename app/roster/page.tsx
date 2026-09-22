"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../context/AuthContext";

const rosterSchema = z.object({
  staffName: z.string().min(2, "Please select a staff member."),
  role: z.string().min(2, "System role is required."),
  shiftDate: z.string().min(1, "Shift date is required."),
  shiftType: z.enum(["MORNING", "AFTERNOON", "NIGHT"]),
  status: z.enum(["SCHEDULED", "CONFIRMED", "COMPLETED", "ABSENT"]).optional(),
});

type RosterFormInputs = z.infer<typeof rosterSchema>;

interface StaffShift {
  shiftId: number;
  staffName: string;
  role: string;
  shiftDate: string;
  shiftType: string;
  status: string;
}

export default function RosterDashboard() {
  const { user } = useAuth();
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [staffList, setStaffList] = useState<any[]>([]);

  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" }>({
    isOpen: false, title: "", message: "", type: "success"
  });

  // FIXED: Added exact SERVICE_CENTER_MANAGER match for the Center Manager view
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "SYSTEM_ADMIN" || user?.role === "EXECUTIVE_OWNER" || user?.role === "SERVICE_CENTER_MANAGER";

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<RosterFormInputs>({
    resolver: zodResolver(rosterSchema),
    mode: "onChange",
    defaultValues: { shiftType: "MORNING", status: "SCHEDULED" }
  });

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  const fetchShifts = async () => {
    try {
      let response;
      if (isAdmin) {
        response = await axios.get("http://localhost:8080/api/roster", getAuthHeader());
      } else {
        const username = user?.fullName || user?.username || "";
        response = await axios.get(`http://localhost:8080/api/roster/staff/${username}`, getAuthHeader());
      }

      const sortedShifts = response.data.sort((a: StaffShift, b: StaffShift) =>
        new Date(b.shiftDate).getTime() - new Date(a.shiftDate).getTime()
      );
      setShifts(sortedShifts);
    } catch (err) {
      console.error("Failed to fetch roster", err);
    }
  };

  const fetchStaffUsers = async () => {
    try {
      const res = await axios.get("http://localhost:8080/api/auth/all", getAuthHeader());
      if (res.data && res.data.length > 0) {
        // Exclude customers and high-level owners from shift scheduling
        const staffOnly = res.data.filter((u: any) =>
          u.role !== 'CUSTOMER' &&
          u.role !== 'SUPER_ADMIN' &&
          u.role !== 'EXECUTIVE_OWNER' &&
          u.role !== 'SYSTEM_ADMIN'
        );
        setStaffList(staffOnly);
      }
    } catch (err) {
      console.error("Failed to fetch staff from database.", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    if (user) {
      fetchShifts();
      if (isAdmin) fetchStaffUsers();
    }
  }, [user, isAdmin]);

  const onSubmit = async (data: RosterFormInputs) => {
    try {
      const payload = { ...data, status: data.status || "SCHEDULED" };

      if (editingShiftId) {
        await axios.put(`http://localhost:8080/api/roster/${editingShiftId}`, payload, getAuthHeader());
        setModal({ isOpen: true, type: "success", title: "Shift Updated", message: "The shift details have been successfully modified." });
        setEditingShiftId(null);
      } else {
        await axios.post("http://localhost:8080/api/roster/assign", payload, getAuthHeader());
        setModal({ isOpen: true, type: "success", title: "Shift Assigned", message: "The new shift has been locked into the roster." });
      }
      reset();
      fetchShifts();
    } catch (err: any) {
      setModal({ isOpen: true, type: "error", title: "Assignment Failed", message: "Unable to process the shift assignment. Please verify inputs." });
    }
  };

  const handleAcknowledge = async (shift: StaffShift) => {
    try {
      const payload = { ...shift, status: "CONFIRMED" };
      await axios.put(`http://localhost:8080/api/roster/${shift.shiftId}`, payload, getAuthHeader());
      setModal({ isOpen: true, type: "success", title: "Job Acknowledged", message: "You have successfully confirmed your attendance for this shift." });
      fetchShifts();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Error", message: "Could not confirm the shift." });
    }
  };

  const handleEdit = (shift: StaffShift) => {
    setEditingShiftId(shift.shiftId);
    setValue("staffName", shift.staffName);
    setValue("role", shift.role);
    setValue("shiftDate", shift.shiftDate);
    setValue("shiftType", shift.shiftType as any);
    setValue("status", shift.status as any);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (shiftId: number) => {
    if (!confirm("Are you sure you want to permanently delete this shift?")) return;
    try {
      await axios.delete(`http://localhost:8080/api/roster/${shiftId}`, getAuthHeader());
      setModal({ isOpen: true, type: "success", title: "Shift Deleted", message: "The scheduled shift has been removed from the ledger." });
      fetchShifts();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Deletion Failed", message: "Cannot delete this shift." });
    }
  };

  if (!isMounted) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10 animate-fade-in-up">
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">{isAdmin ? "Staff Roster Master" : "My Work Schedule"}</h1>
          <p className="text-slate-500 font-medium mt-2">
            {isAdmin
              ? "Schedule shifts, manage workforce allocation, and monitor attendance."
              : `Welcome, ${user?.fullName || user?.username}. Review and acknowledge your upcoming assigned working shifts.`}
          </p>
        </div>

        <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-8`}>

          {isAdmin && (
            <div className="lg:col-span-1 animate-fade-in-up">
              <div className={`bg-white p-8 rounded-3xl shadow-sm border ${editingShiftId ? 'border-yellow-400 ring-4 ring-yellow-400/10' : 'border-slate-200'}`}>
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-bold text-slate-800">{editingShiftId ? "Edit Shift" : "Assign Shift"}</h2>
                  {editingShiftId && (
                    <button onClick={() => { setEditingShiftId(null); reset(); }} className="text-xs font-bold text-slate-400 hover:text-slate-700">Cancel</button>
                  )}
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Staff Member</label>
                    <select
                      {...register("staffName")}
                      onChange={(e) => {
                        register("staffName").onChange(e);
                        const selectedVal = e.target.value;
                        const matchedStaff = staffList.find(s => (s.fullName || s.username) === selectedVal);
                        if (matchedStaff) {
                          setValue("role", matchedStaff.role, { shouldValidate: true });
                        } else {
                          setValue("role", "");
                        }
                      }}
                      className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none cursor-pointer transition-all ${errors.staffName ? "border-red-500 focus:ring-4 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500"}`}
                    >
                      <option value="">-- Select Staff Profile --</option>
                      {staffList.map((staff, idx) => {
                        const displayName = staff.fullName || staff.username || "Unknown Staff";
                        return (
                          <option key={idx} value={displayName}>
                            {displayName} ({staff.role.replace(/_/g, ' ')})
                          </option>
                        );
                      })}
                    </select>
                    {errors.staffName && <p className="mt-1.5 text-[11px] font-bold text-red-500">{errors.staffName.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5 flex justify-between">
                      <span>System Role</span>
                      <span className="text-[10px] text-blue-600">Auto-filled</span>
                    </label>
                    <input
                      {...register("role")}
                      type="text" readOnly placeholder="Select a staff member first..."
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 font-bold uppercase tracking-wider text-xs outline-none cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Shift Date</label>
                    <input {...register("shiftDate")} type="date" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none transition-all ${errors.shiftDate ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                    {errors.shiftDate && <p className="mt-1.5 text-[11px] font-bold text-red-500">{errors.shiftDate.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Shift Block</label>
                    <select {...register("shiftType")} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-500 cursor-pointer font-bold">
                      <option value="MORNING">☀️ Morning (08:00 - 16:00)</option>
                      <option value="AFTERNOON">🌤️ Afternoon (16:00 - 00:00)</option>
                      <option value="NIGHT">🌙 Night (00:00 - 08:00)</option>
                    </select>
                  </div>

                  {editingShiftId && (
                    <div className="pt-2">
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">Override Attendance Status</label>
                      <select {...register("status")} className="w-full px-4 py-2.5 rounded-xl border border-yellow-200 bg-yellow-50 outline-none focus:border-yellow-500 cursor-pointer font-bold text-yellow-800">
                        <option value="SCHEDULED">Scheduled</option>
                        <option value="CONFIRMED">Confirmed</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="ABSENT">Absent</option>
                      </select>
                    </div>
                  )}

                  <button type="submit" disabled={isSubmitting} className={`w-full text-white font-bold py-3.5 px-4 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 mt-4 ${editingShiftId ? 'bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/20' : 'bg-slate-900 hover:bg-blue-600'}`}>
                    {isSubmitting ? "Processing..." : editingShiftId ? "Update Shift Details" : "Lock in Shift"}
                  </button>
                </form>
              </div>
            </div>
          )}

          <div className={`${isAdmin ? 'lg:col-span-2' : 'lg:col-span-3'} animate-fade-in-up`}>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-full">
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">{isAdmin ? "Master Roster Schedule" : "My Assigned Shifts"}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-white border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-8 py-4">Date & Time</th>
                      <th className="px-8 py-4">Staff Member</th>
                      <th className="px-8 py-4">Role</th>
                      <th className="px-8 py-4 text-center">Status</th>
                      <th className="px-8 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700">
                    {shifts.map((shift) => (
                      <tr key={shift.shiftId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-5">
                          <p className="text-slate-900 font-bold">{new Date(shift.shiftDate).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</p>
                          <p className="text-xs text-blue-600 font-bold mt-0.5 uppercase tracking-wider">{shift.shiftType}</p>
                        </td>
                        <td className="px-8 py-5 font-bold text-slate-800">{shift.staffName}</td>
                        <td className="px-8 py-5">
                          <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border border-slate-200">
                            {shift.role.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-black tracking-widest uppercase border ${
                            shift.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            shift.status === 'CONFIRMED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            shift.status === 'ABSENT' ? 'bg-red-50 text-red-700 border-red-200' :
                            'bg-yellow-50 text-yellow-700 border-yellow-200'
                          }`}>
                            {shift.status || "SCHEDULED"}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          {isAdmin ? (
                            <div className="flex justify-end gap-1">
                              <button onClick={() => handleEdit(shift)} className="p-2 text-slate-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors" title="Edit Shift">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => handleDelete(shift.shiftId)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete Shift">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end">
                              {shift.status === "SCHEDULED" ? (
                                <button onClick={() => handleAcknowledge(shift)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-md transition-all active:scale-95 flex items-center gap-1.5">
                                  Acknowledge
                                </button>
                              ) : (
                                <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5 justify-end">Acknowledged</span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {shifts.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-12 text-slate-500 font-medium">No shifts scheduled.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-200 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">{modal.title}</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">{modal.message}</p>
            <button onClick={() => setModal({ ...modal, isOpen: false })} className="w-full px-4 py-3 mt-2 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md">
              Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}