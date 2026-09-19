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
}

interface SparePart {
  id: number;
  name: string;
  partCode: string;
  currentStock: number;
  unitPrice: number;
}

export default function StaffBookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [inventory, setInventory] = useState<SparePart[]>([]);
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });
  const [isMounted, setIsMounted] = useState(false);

  const isTechnician = user?.role === 'TECHNICIAN';

  // Modal States
  const [activeModal, setActiveModal] = useState<{ isOpen: boolean; type: 'CANCEL' | 'DELETE' | null; bookingID: number | null }>({
    isOpen: false, type: null, bookingID: null,
  });

  // Digital Job Card States
  const [jobCardModal, setJobCardModal] = useState<{ isOpen: boolean; bookingID: number | null }>({ isOpen: false, bookingID: null });
  const [selectedParts, setSelectedParts] = useState<{ partId: number; name: string; qty: number }[]>([]);

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
      console.error("Failed to fetch data", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData();
  }, []);

  const handleUpdateStatus = async (id: number, newStatus: string, techId?: number) => {
    try {
      let url = `http://localhost:8080/api/bookings/${id}/status?status=${newStatus}`;
      if (techId) url += `&technicianId=${techId}`;
      await axios.put(url, {}, getAuthHeader());
      fetchData();
    } catch (err) {
      setServerMessage({ type: "error", text: "Failed to update vehicle status." });
    }
  };

  const openJobCard = (id: number) => {
    setSelectedParts([]);
    setJobCardModal({ isOpen: true, bookingID: id });
  };

  const handleAddPartToJob = (partId: number, name: string) => {
    setSelectedParts(prev => {
      const existing = prev.find(p => p.partId === partId);
      if (existing) return prev.map(p => p.partId === partId ? { ...p, qty: p.qty + 1 } : p);
      return [...prev, { partId, name, qty: 1 }];
    });
  };

  const handleRemovePart = (partId: number) => {
    setSelectedParts(prev => prev.filter(p => p.partId !== partId));
  };

  const submitJobCard = async () => {
    if (!jobCardModal.bookingID) return;

    // Convert UI array format to the Map<Long, Integer> format expected by Spring Boot
    const partsMap: Record<number, number> = {};
    selectedParts.forEach(p => { partsMap[p.partId] = p.qty; });

    try {
      await axios.put(`http://localhost:8080/api/bookings/${jobCardModal.bookingID}/complete`, { partsUsed: partsMap }, getAuthHeader());
      setServerMessage({ type: "success", text: `Job #${jobCardModal.bookingID} completed & parts deducted successfully!` });
      setJobCardModal({ isOpen: false, bookingID: null });
      fetchData();
      setTimeout(() => setServerMessage({ type: "", text: "" }), 4000);
    } catch (err: any) {
      setServerMessage({ type: "error", text: err.response?.data || "Failed to process job completion. Check stock levels." });
    }
  };

  const executeModalAction = async () => {
    if (!activeModal.bookingID || !activeModal.type) return;
    try {
      if (activeModal.type === 'CANCEL') {
        await axios.put(`http://localhost:8080/api/bookings/${activeModal.bookingID}/status?status=CANCELLED`, {}, getAuthHeader());
      } else {
        await axios.delete(`http://localhost:8080/api/bookings/${activeModal.bookingID}`, getAuthHeader());
      }
      fetchData();
      setActiveModal({ isOpen: false, type: null, bookingID: null });
    } catch (err) {
      setServerMessage({ type: "error", text: "Failed to process the request." });
    }
  };

  if (!isMounted) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12 relative">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10 animate-fade-in-up">
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Workshop Schedule</h1>
          <p className="text-slate-500 font-medium mt-2">Manage active jobs and log physical parts consumed.</p>
        </div>

        {serverMessage.text && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-bold flex items-center gap-3 ${serverMessage.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {serverMessage.text}
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-widest text-slate-400">
                  <th className="px-8 py-4 font-bold">Vehicle Reg</th>
                  <th className="px-8 py-4 font-bold">Package</th>
                  <th className="px-8 py-4 font-bold">Status</th>
                  <th className="px-8 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm font-medium text-slate-700">
                {bookings.map((job) => (
                  <tr key={job.bookingID} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-8 py-5 font-bold text-slate-900">{job.vehicleRegNo}</td>
                    <td className="px-8 py-5">{job.servicePackage}</td>
                    <td className="px-8 py-5 font-bold">{job.status}</td>
                    <td className="px-8 py-5 text-right flex justify-end gap-3">
                      {job.status === "PENDING" && isTechnician && (
                        <button onClick={() => handleUpdateStatus(job.bookingID, "IN_PROGRESS", user?.id)} className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg text-xs">
                          Start Job
                        </button>
                      )}
                      {job.status === "IN_PROGRESS" && job.assignedTechnicianID === user?.id && (
                        <button onClick={() => openJobCard(job.bookingID)} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs">
                          Complete & Log Parts
                        </button>
                      )}
                      {job.status === "COMPLETED" && (
                         <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                           Billed Rs.{job.totalPartsCost || 0}
                         </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- DIGITAL JOB CARD MODAL (Technician Part Logging) --- */}
      {jobCardModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 rounded-t-3xl">
              <h3 className="text-2xl font-black text-slate-900">Digital Job Card #{jobCardModal.bookingID}</h3>
              <p className="text-slate-500 text-sm font-medium mt-1">Select parts consumed from inventory during servicing.</p>
            </div>

            <div className="flex-1 overflow-y-auto p-8 grid md:grid-cols-2 gap-8">
              {/* Left Side: Available Inventory */}
              <div>
                <h4 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-widest">Available Inventory</h4>
                <div className="space-y-2">
                  {inventory.filter(p => p.currentStock > 0).map(part => (
                    <div key={part.id} className="flex justify-between items-center p-3 border border-slate-200 rounded-xl hover:border-blue-300">
                      <div>
                        <div className="font-bold text-slate-800 text-sm">{part.name}</div>
                        <div className="text-xs text-slate-400">Stock: {part.currentStock} | Rs.{part.unitPrice}</div>
                      </div>
                      <button onClick={() => handleAddPartToJob(part.id, part.name)} className="px-3 py-1 bg-slate-100 hover:bg-blue-100 text-blue-600 font-bold rounded-lg text-xs">+</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Side: Added to Job */}
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-widest">Consumed Parts</h4>
                {selectedParts.length === 0 ? (
                  <p className="text-sm text-slate-400 font-medium italic">No parts added yet. Job will complete with zero material cost.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedParts.map(sp => (
                      <div key={sp.partId} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-sm font-bold text-slate-700">{sp.qty}x {sp.name}</span>
                        <button onClick={() => handleRemovePart(sp.partId)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-md">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-8 py-5 border-t border-slate-100 bg-white rounded-b-3xl flex justify-end gap-3">
              <button onClick={() => setJobCardModal({ isOpen: false, bookingID: null })} className="px-6 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
              <button onClick={submitJobCard} className="px-6 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20">Finalize & Route to Finance</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}