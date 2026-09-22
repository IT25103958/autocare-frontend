"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

interface ServiceBooking {
  bookingID: number;
  vehicleRegNo: string;
  servicePackage: string;
  preferredDate: string;
  status: string;
  assignedTechnicianID?: number;
  assignedServiceBay?: string;
  totalPartsCost?: number;
  laborCharge?: number;
  partsUsedSummary?: string;
  managerNotes?: string;
  technicianNotes?: string;
  technicianName?: string;
}

interface SparePart {
  id?: number;
  partId?: number;
  partID?: number;
  name: string;
  partCode: string;
  currentStock: number;
  unitPrice: number;
}

export default function StaffBookingsPage() {
  const [reportModal, setReportModal] = useState<ServiceBooking | null>(null);
  const { user } = useAuth();
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [inventory, setInventory] = useState<SparePart[]>([]);
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });
  const [isMounted, setIsMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const isTechnician = user?.role === 'TECHNICIAN';

  const [newBookingModal, setNewBookingModal] = useState(false);
  const [newVehicleReg, setNewVehicleReg] = useState("");
  const [newPackage, setNewPackage] = useState("Full Engine Diagnostic & Tuning");
  const [newBay, setNewBay] = useState("Bay 1 - Hydraulic Lift");
  const [newManagerNotes, setNewManagerNotes] = useState("");

  const [jobCardModal, setJobCardModal] = useState<{ isOpen: boolean; bookingID: number | null }>({ isOpen: false, bookingID: null });
  const [selectedParts, setSelectedParts] = useState<{ partId: number; name: string; qty: number; unitPrice: number }[]>([]);
  const [techReport, setTechReport] = useState("");

  // NEW: State to capture the manual labor fee
  const [laborCharge, setLaborCharge] = useState<number>(0);

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  const fetchData = async () => {
    try {
      const [bookRes, invRes] = await Promise.all([
        axios.get("http://localhost:8080/api/bookings", getAuthHeader()),
        axios.get("http://localhost:8080/api/parts", getAuthHeader()).catch(() => ({ data: [] }))
      ]);
      const sortedBookings = bookRes.data.sort((a: ServiceBooking, b: ServiceBooking) => new Date(b.preferredDate).getTime() - new Date(a.preferredDate).getTime());
      setBookings(sortedBookings);
      setInventory(invRes.data);
    } catch (err) {
      console.error("Failed to fetch workshop data", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData();
  }, []);

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post("http://localhost:8080/api/bookings", {
        vehicleRegNo: newVehicleReg,
        servicePackage: newPackage,
        assignedServiceBay: newBay,
        managerNotes: newManagerNotes,
        preferredDate: new Date().toISOString(),
        status: "PENDING"
      }, getAuthHeader());

      setServerMessage({ type: "success", text: "New job card created and queued successfully." });
      setNewBookingModal(false);
      setNewVehicleReg("");
      setNewManagerNotes("");
      fetchData();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 4000);
    } catch (err: any) {
      setServerMessage({ type: "error", text: err.response?.data || "Failed to create booking." });
    }
  };

  const handleUpdateStatus = async (id: number, newStatus: string, techId?: number) => {
    try {
      let url = `http://localhost:8080/api/bookings/${id}/status?status=${newStatus}`;
      if (techId) url += `&technicianId=${techId}`;
      await axios.put(url, {}, getAuthHeader());
      setServerMessage({ type: "success", text: `Job status updated to ${newStatus}` });
      fetchData();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } catch (err) {
      setServerMessage({ type: "error", text: "Failed to update vehicle status." });
    }
  };

  const handleCancelTask = async (id: number) => {
    if (!window.confirm("Are you sure you want to cancel this job? It will be marked as CANCELLED in the history ledger.")) return;
    try {
      await axios.put(`http://localhost:8080/api/bookings/${id}/status?status=CANCELLED`, {}, getAuthHeader());
      setServerMessage({ type: "success", text: "Job successfully cancelled and aborted." });
      fetchData();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } catch (err) {
      setServerMessage({ type: "error", text: "Failed to cancel job." });
    }
  };

  const openJobCard = (id: number) => {
    setSelectedParts([]);
    setTechReport("");
    setLaborCharge(0); // Reset labor fee
    setJobCardModal({ isOpen: true, bookingID: id });
  };

  const handleAddPartToJob = (part: SparePart) => {
    const activeId = part.partID || part.partId || part.id;
    if (!activeId) return;

    setSelectedParts(prev => {
      const existing = prev.find(p => p.partId === activeId);
      if (existing) {
        if (existing.qty >= part.currentStock) {
          alert("Cannot exceed available inventory stock!");
          return prev;
        }
        return prev.map(p => p.partId === activeId ? { ...p, qty: p.qty + 1 } : p);
      }
      return [...prev, { partId: activeId, name: part.name, qty: 1, unitPrice: part.unitPrice }];
    });
  };

  const handleRemovePart = (partId: number) => {
    setSelectedParts(prev => prev.filter(p => p.partId !== partId));
  };

  const submitJobCard = async () => {
    if (!jobCardModal.bookingID) return;

    const partsMap: Record<number, number> = {};
    selectedParts.forEach(p => { partsMap[p.partId] = p.qty; });

    try {
      await axios.put(`http://localhost:8080/api/bookings/${jobCardModal.bookingID}/complete`, {
        partsUsed: partsMap,
        technicianNotes: techReport,
        laborCharge: laborCharge // Sends labor fee to backend
      }, getAuthHeader());

      setServerMessage({ type: "success", text: `Job #${jobCardModal.bookingID} completed & parts deducted securely via ACID transaction!` });
      setJobCardModal({ isOpen: false, bookingID: null });
      fetchData();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 4000);
    } catch (err: any) {
      setServerMessage({ type: "error", text: err.response?.data || "Failed to process job completion. Check stock levels." });
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("DANGER: Are you sure you want to permanently delete this cancelled record from the database?")) return;
    try {
      await axios.delete(`http://localhost:8080/api/bookings/${id}`, getAuthHeader());
      setServerMessage({ type: "success", text: "Record permanently removed from the system." });
      fetchData();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
    } catch (err) {
      setServerMessage({ type: "error", text: "Failed to delete booking." });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED": return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
      case "IN_PROGRESS": return "bg-blue-500/10 text-blue-700 border-blue-500/20";
      case "PENDING": return "bg-amber-500/10 text-amber-700 border-amber-500/20";
      case "CANCELLED": return "bg-slate-500/10 text-slate-500 border-slate-500/20";
      default: return "bg-slate-500/10 text-slate-700 border-slate-500/20";
    }
  };

  const filteredBookings = bookings.filter(b =>
    b.vehicleRegNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.servicePackage.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isMounted) return null;

  return (
    <div className="min-h-[calc(100vh-72px)] bg-slate-50 p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-6">

        <div className="bg-white p-6 lg:p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Workshop Job Cards</h1>
              <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-[10px] font-black uppercase tracking-widest">
                {isTechnician ? "Technician Portal" : "Service Operations"}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-500 mt-2">
              Manage active repair bays, assign technicians, and execute atomic inventory part deductions.
            </p>
          </div>

          {!isTechnician && (
            <button
              onClick={() => setNewBookingModal(true)}
              className="px-6 py-3 bg-slate-900 hover:bg-blue-600 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition-all duration-300"
            >
              + Create New Job
            </button>
          )}
        </div>

        {serverMessage.text && (
          <div className={`p-4 rounded-2xl text-sm font-bold flex items-center gap-3 shadow-sm ${serverMessage.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
            {serverMessage.text}
          </div>
        )}

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="relative flex-1">
            <svg className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by vehicle registration, package, or status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-800 text-sm font-bold text-slate-800 transition-all"
            />
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-widest font-black">
                  <th className="p-5 rounded-tl-3xl">Vehicle Reg</th>
                  <th className="p-5">Service Package</th>
                  <th className="p-5">Bay Assigned</th>
                  <th className="p-5">Status</th>
                  <th className="p-5 rounded-tr-3xl text-right">Workshop Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 text-sm font-bold">
                      No job cards found in the queue.
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map((job) => {
                    const isOwner = job.technicianName === user?.sub || job.technicianName === user?.username || !job.technicianName;

                    return (
                    <tr key={job.bookingID} className="hover:bg-slate-50 transition-colors">
                      <td className="p-5 font-black text-slate-900">{job.vehicleRegNo}</td>
                      <td className="p-5 text-sm font-semibold text-slate-700">{job.servicePackage}</td>
                      <td className="p-5 text-xs font-bold text-slate-500">{job.assignedServiceBay || "General Bay"}</td>
                      <td className="p-5">
                        <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md border ${getStatusBadge(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="p-5 text-right flex justify-end items-center gap-2">

                        {job.status === "PENDING" && (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(job.bookingID, "IN_PROGRESS", user?.id || 999)}
                              className="px-3.5 py-2 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-xl text-xs transition-all shadow-sm"
                            >
                              Start Job
                            </button>
                            {!isTechnician && (
                              <button
                                onClick={() => handleCancelTask(job.bookingID)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                title="Cancel Job"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              </button>
                            )}
                          </>
                        )}

                        {job.status === "IN_PROGRESS" && (
                          <div className="flex flex-col items-end gap-2">
                            {job.technicianName && (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-md border border-blue-200">
                                Active Tech: {job.technicianName}
                              </span>
                            )}

                            {(!isTechnician || isOwner) && (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleCancelTask(job.bookingID)}
                                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-all"
                                >
                                  Abort
                                </button>
                                <button
                                  onClick={() => openJobCard(job.bookingID)}
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/20 transition-all"
                                >
                                  Complete & Deduct Parts
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {job.status === "COMPLETED" && (
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                              Billed: Rs.{job.totalPartsCost || 0}
                            </span>
                            <button
                              onClick={() => setReportModal(job)}
                              className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline underline-offset-2"
                            >
                              View Final Report
                            </button>
                          </div>
                        )}

                        {job.status === "CANCELLED" && (
                          <div className="flex items-center justify-end gap-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-md">
                              Task Aborted
                            </span>
                            <button
                              onClick={() => handleUpdateStatus(job.bookingID, "PENDING")}
                              className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-xl text-xs transition-all shadow-sm"
                            >
                              Re-Queue Job
                            </button>
                            {!isTechnician && (
                              <button
                                onClick={() => handleDelete(job.bookingID)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Delete Record Permanently"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {newBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 p-8 space-y-6">
            <h3 className="text-2xl font-black text-slate-900">Create Workshop Job Card</h3>
            <form onSubmit={handleCreateBooking} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Vehicle Registration No</label>
                <input
                  type="text" required placeholder="e.g. WP-ABC-1234"
                  value={newVehicleReg} onChange={(e) => setNewVehicleReg(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-800 text-sm font-bold text-slate-800 uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Service Package</label>
                <select
                  value={newPackage} onChange={(e) => setNewPackage(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-800 text-sm font-bold text-slate-800 cursor-pointer"
                >
                  <option value="Full Engine Diagnostic & Tuning">Full Engine Diagnostic & Tuning</option>
                  <option value="Synthetic Oil & Filter Replacement">Synthetic Oil & Filter Replacement</option>
                  <option value="Brake Pad & Rotor Servicing">Brake Pad & Rotor Servicing</option>
                  <option value="Hybrid Battery Health Check">Hybrid Battery Health Check</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Service Bay Assignment</label>
                <select
                  value={newBay} onChange={(e) => setNewBay(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-800 text-sm font-bold text-slate-800 cursor-pointer"
                >
                  <option value="Bay 1 - Hydraulic Lift">Bay 1 - Hydraulic Lift</option>
                  <option value="Bay 2 - Alignment & Suspension">Bay 2 - Alignment & Suspension</option>
                  <option value="Bay 3 - Electrical Diagnostics">Bay 3 - Electrical Diagnostics</option>
                  <option value="Bay 4 - Quick Express Lube">Bay 4 - Quick Express Lube</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Instructions for Technician</label>
                <textarea
                  placeholder="e.g. Check for brake pad wear. Customer reported squeaking."
                  value={newManagerNotes} onChange={(e) => setNewManagerNotes(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-800 text-sm font-bold text-slate-800 h-24 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setNewBookingModal(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md">Dispatch to Queue</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {jobCardModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 rounded-t-3xl flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-900">Digital Job Card #{jobCardModal.bookingID}</h3>
                <p className="text-slate-500 text-sm font-medium mt-1">Add spare parts and log your labor charge.</p>
              </div>
              <button onClick={() => setJobCardModal({ isOpen: false, bookingID: null })} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
            </div>

            {(() => {
              const activeJob = bookings.find(b => b.bookingID === jobCardModal.bookingID);
              const partsTotal = selectedParts.reduce((acc, curr) => acc + (curr.qty * curr.unitPrice), 0);
              const grandTotal = partsTotal + Number(laborCharge);

              return (
                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8">
                  {activeJob?.managerNotes && (
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3">
                      <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-amber-800 mb-1">Manager Instructions</h4>
                        <p className="text-sm font-bold text-amber-900">{activeJob.managerNotes}</p>
                      </div>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h4 className="font-bold text-slate-900 mb-4 text-xs uppercase tracking-widest text-slate-400">Available Spare Parts</h4>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                        {inventory.filter(p => p.currentStock > 0).map((part, index) => {
                          const activeId = part.partID || part.partId || part.id;
                          return (
                            <div key={activeId || index} className="flex justify-between items-center p-3 border border-slate-200 rounded-xl hover:border-blue-300 bg-white shadow-xs">
                              <div>
                                <div className="font-black text-slate-800 text-sm">{part.name}</div>
                                <div className="text-xs text-slate-400 font-medium">Stock: {part.currentStock} | Rs.{part.unitPrice}</div>
                              </div>
                              <button onClick={() => handleAddPartToJob(part)} className="px-3 py-1.5 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-lg text-xs transition-all shadow-xs">+ Add</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 mb-4 text-xs uppercase tracking-widest text-slate-400">Consumed Parts Summary</h4>
                        {selectedParts.length === 0 ? (
                          <p className="text-sm text-slate-400 font-medium italic">No parts added yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {selectedParts.map(sp => (
                              <div key={sp.partId} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                                <div>
                                  <span className="text-sm font-black text-slate-800">{sp.name}</span>
                                  <div className="text-xs text-slate-500 font-bold">Qty: {sp.qty} × Rs.{sp.unitPrice} = Rs.{sp.qty * sp.unitPrice}</div>
                                </div>
                                <button onClick={() => handleRemovePart(sp.partId)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all">✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-200 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Parts Subtotal:</span>
                          <span className="text-sm font-bold text-slate-900">Rs.{partsTotal.toFixed(2)}</span>
                        </div>

                        <div className="flex justify-between items-center bg-blue-50 border border-blue-100 p-3 rounded-xl">
                          <span className="text-xs font-black uppercase tracking-wider text-blue-800">Labor / Service Fee:</span>
                          <input
                            type="number"
                            min="0"
                            value={laborCharge}
                            onChange={(e) => setLaborCharge(Number(e.target.value))}
                            className="w-24 px-2 py-1.5 rounded-lg border border-blue-200 outline-none text-right font-black text-blue-900 text-sm"
                          />
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-900">Grand Total:</span>
                          <span className="text-xl font-black text-emerald-600">Rs.{grandTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Final Diagnostic Report</label>
                    <textarea
                      placeholder="Enter final diagnostic notes, repairs completed, or future recommendations..."
                      value={techReport} onChange={(e) => setTechReport(e.target.value)}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-sm font-bold text-slate-800 h-24 resize-none transition-all shadow-inner"
                    />
                  </div>
                </div>
              );
            })()}

            <div className="px-8 py-5 border-t border-slate-100 bg-white rounded-b-3xl flex justify-end gap-3">
              <button onClick={() => setJobCardModal({ isOpen: false, bookingID: null })} className="px-6 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
              <button onClick={submitJobCard} className="px-6 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20">Finalize Job</button>
            </div>
          </div>
        </div>
      )}

      {reportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-900 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-white">Final Service Report</h3>
                <p className="text-slate-400 text-xs font-medium mt-1">{reportModal.vehicleRegNo} • {reportModal.servicePackage}</p>
              </div>
              <button onClick={() => setReportModal(null)} className="text-slate-400 hover:text-white font-bold text-lg transition-colors">✕</button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Technician Diagnostic Report</h4>
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm font-bold text-blue-900">
                  {reportModal.technicianNotes || <span className="text-blue-400 italic font-medium">No diagnostic notes recorded.</span>}
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Customer Invoice Breakdown</h4>
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
                  <pre className="text-xs font-mono font-bold text-slate-600 whitespace-pre-wrap mb-4">
                    {reportModal.partsUsedSummary}
                  </pre>

                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500">Parts Cost</span>
                    <span className="text-sm font-bold text-slate-700">Rs.{((reportModal.totalPartsCost || 0) - (reportModal.laborCharge || 0)).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500">Service / Labor Fee</span>
                    <span className="text-sm font-bold text-slate-700">Rs.{(reportModal.laborCharge || 0).toLocaleString()}</span>
                  </div>
                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-900">Total Billed</span>
                    <span className="text-xl font-black text-emerald-600">Rs.{reportModal.totalPartsCost?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}