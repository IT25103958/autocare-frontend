"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../context/AuthContext";
import Link from "next/link";

const partSchema = z.object({
  partCode: z.string().min(3, "Code must be at least 3 characters."),
  name: z.string().min(2, "Part name is required."),
  category: z.enum(["Engine", "Brakes", "Suspension", "Electrical", "Consumables"]),
  unitPrice: z.coerce.number().min(0.01, "Price must be greater than Rs. 0."),
  currentStock: z.coerce.number().int("Decimals are not allowed.").min(0, "Stock cannot be negative."),
  minimumStockLevel: z.coerce.number().int("Decimals are not allowed.").min(1, "Minimum stock level must be at least 1."),
});

type PartFormInputs = z.infer<typeof partSchema>;

interface SparePart {
  partID: number;
  partCode: string;
  name: string;
  category: string;
  unitPrice: number;
  currentStock: number;
  minimumStockLevel: number;
}

export default function PartsInventoryPage() {
  const { user } = useAuth();
  const [parts, setParts] = useState<SparePart[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [editingPartId, setEditingPartId] = useState<number | null>(null);

  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" }>({
    isOpen: false, title: "", message: "", type: "success"
  });

  const isManager = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "INVENTORY_MANAGER";

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<PartFormInputs>({
    resolver: zodResolver(partSchema),
    mode: "onChange",
    defaultValues: { category: "Engine", currentStock: 0, minimumStockLevel: 5 }
  });

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  const fetchParts = async () => {
    try {
      const response = await axios.get("http://localhost:8080/api/parts", getAuthHeader());
      setParts(response.data);
    } catch (err) {
      console.error("Failed to fetch inventory", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    if (user) fetchParts();
  }, [user]);

  const onSubmit = async (data: PartFormInputs) => {
    try {
      if (editingPartId) {
        await axios.put(`http://localhost:8080/api/parts/${editingPartId}`, data, getAuthHeader());
        setModal({ isOpen: true, type: "success", title: "Update Successful", message: "The component details have been updated in the ledger." });
        setEditingPartId(null);
      } else {
        await axios.post("http://localhost:8080/api/parts", data, getAuthHeader());
        setModal({ isOpen: true, type: "success", title: "Part Registered", message: "The new spare part has been added to the inventory." });
      }
      reset();
      fetchParts();
    } catch (err: any) {
      setModal({ isOpen: true, type: "error", title: "Action Failed", message: "Unable to process request. Ensure the Part Code is unique." });
    }
  };

  const handleEdit = (part: SparePart) => {
    setEditingPartId(part.partID);
    setValue("partCode", part.partCode);
    setValue("name", part.name);
    setValue("category", part.category as any);
    setValue("unitPrice", part.unitPrice);
    setValue("currentStock", part.currentStock);
    setValue("minimumStockLevel", part.minimumStockLevel);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (partId: number) => {
    if (!confirm("Confirm permanent deletion of this inventory record?")) return;
    try {
      await axios.delete(`http://localhost:8080/api/parts/${partId}`, getAuthHeader());
      setModal({ isOpen: true, type: "success", title: "Record Deleted", message: "The component has been completely removed from the system." });
      fetchParts();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Deletion Failed", message: "Cannot delete this part. It is tied to existing database records." });
    }
  };

  if (!isMounted) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10 animate-fade-in-up">
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Spare Parts Inventory</h1>
          <p className="text-slate-500 font-medium mt-2">
            {isManager ? "Manage automotive components, update details, and remove obsolete stock." : "View authorized component catalog. Live storage data is restricted."}
          </p>
        </div>

        <div className={`grid grid-cols-1 ${isManager ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-8`}>

          {/* --- ADMIN ONLY: ADD PART FORM --- */}
          {isManager && (
            <div className="lg:col-span-1 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div className={`bg-white p-8 rounded-3xl shadow-sm border ${editingPartId ? 'border-yellow-400 ring-4 ring-yellow-400/10' : 'border-slate-200'}`}>
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-bold text-slate-800">
                    {editingPartId ? "Edit Component" : "Add Spare Part"}
                  </h2>
                  {editingPartId && (
                    <button onClick={() => { setEditingPartId(null); reset(); }} className="text-xs font-bold text-slate-400 hover:text-slate-700">Cancel</button>
                  )}
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Part Code</label>
                    <input {...register("partCode")} disabled={!!editingPartId} type="text" className={`w-full px-4 py-2.5 rounded-xl border font-mono uppercase outline-none ${editingPartId ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-50 focus:border-blue-500'} ${errors.partCode ? "border-red-500" : "border-slate-200"}`} />
                    {errors.partCode && <p className="mt-1.5 text-[11px] font-bold text-red-500">{errors.partCode.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Part Name</label>
                    <input {...register("name")} type="text" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none ${errors.name ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                    {errors.name && <p className="mt-1.5 text-[11px] font-bold text-red-500">{errors.name.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Category</label>
                    <select {...register("category")} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-500 cursor-pointer">
                      <option value="Engine">Engine</option>
                      <option value="Brakes">Brakes</option>
                      <option value="Suspension">Suspension</option>
                      <option value="Electrical">Electrical</option>
                      <option value="Consumables">Consumables</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">Stock</label>
                      <input {...register("currentStock")} type="number" step="1" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none ${errors.currentStock ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                      {errors.currentStock && <p className="mt-1.5 text-[11px] font-bold text-red-500">{errors.currentStock.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">Price (LKR)</label>
                      <input {...register("unitPrice")} type="number" step="0.01" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none ${errors.unitPrice ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                      {errors.unitPrice && <p className="mt-1.5 text-[11px] font-bold text-red-500">{errors.unitPrice.message}</p>}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Safety Alert Level</label>
                    <input {...register("minimumStockLevel")} type="number" step="1" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none ${errors.minimumStockLevel ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                  </div>

                  <button type="submit" disabled={isSubmitting} className={`w-full text-white font-bold py-3.5 px-4 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 mt-2 ${editingPartId ? 'bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/20' : 'bg-slate-900 hover:bg-blue-600'}`}>
                    {isSubmitting ? "Processing..." : editingPartId ? "Update Details" : "Register to Inventory"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* --- SUPPLIER REDIRECT BANNER (If not manager) --- */}
          {!isManager && (
            <div className="lg:col-span-3 mb-4 bg-blue-50 border border-blue-100 p-6 rounded-3xl flex items-center justify-between animate-fade-in-up">
              <div>
                <h4 className="text-blue-900 font-black text-lg">Submitting New Components?</h4>
                <p className="text-blue-700 text-sm mt-1">Manual inventory adjustments are locked. Please use the Deliveries portal to dispatch new stock.</p>
              </div>
              <Link href="/deliveries" className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 whitespace-nowrap">
                Go to Deliveries
              </Link>
            </div>
          )}

          {/* --- MASTER INVENTORY TABLE (Adaptive to Role) --- */}
          <div className={`${isManager ? 'lg:col-span-2' : 'lg:col-span-3'} animate-fade-in-up`} style={{ animationDelay: '0.2s' }}>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-full">
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-800">{isManager ? "Master Inventory Ledger" : "Authorized Component Catalog"}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-6 py-4">Component Details</th>
                      <th className="px-6 py-4 text-right">Unit Price</th>
                      {/* ONLY MANAGERS SEE STOCK & SYSTEM HEALTH */}
                      {isManager && (
                        <>
                          <th className="px-6 py-4 text-right">Live Stock</th>
                          <th className="px-6 py-4 text-center">System Status</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700">
                    {parts.map((p) => {
                      const isLowStock = p.currentStock <= p.minimumStockLevel;
                      return (
                        <tr key={p.partID} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-5">
                            <p className="text-slate-900 font-bold">{p.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{p.partCode}</span>
                              <span className="text-[10px] font-bold text-blue-600 uppercase">{p.category}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-right font-mono text-slate-600">Rs. {(p.unitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>

                          {/* ONLY MANAGERS SEE STOCK & SYSTEM HEALTH */}
                          {isManager && (
                            <>
                              <td className="px-6 py-5 text-right">
                                <span className={`font-black text-lg ${isLowStock ? 'text-red-600' : 'text-slate-900'}`}>{p.currentStock || 0}</span>
                              </td>
                              <td className="px-6 py-5 text-center">
                                {isLowStock ? (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black bg-red-50 text-red-600 border border-red-100">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                    CRITICAL
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    OPTIMAL
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-5 text-right">
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => handleEdit(p)} className="p-2 text-slate-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors" title="Edit">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  </button>
                                  <button onClick={() => handleDelete(p.partID)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-200 text-center">
            <div className={`flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto ${modal.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={modal.type === 'success' ? "M5 13l4 4L19 7" : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"} />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">{modal.title}</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">{modal.message}</p>
            <button onClick={() => setModal({ ...modal, isOpen: false })} className="w-full px-4 py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md transition-all active:scale-95">Acknowledge</button>
          </div>
        </div>
      )}
    </div>
  );
}