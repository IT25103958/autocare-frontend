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
  id?: number;
  partId?: number;
  partID?: number;
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
  const [supplierList, setSupplierList] = useState<any[]>([]);

  // Modals
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" }>({ isOpen: false, title: "", message: "", type: "success" });
  const [rmaModal, setRmaModal] = useState<{ isOpen: boolean; part: SparePart | null }>({ isOpen: false, part: null });
  const [supplyModal, setSupplyModal] = useState<{ isOpen: boolean; part: SparePart | null }>({ isOpen: false, part: null });

  // Form States
  const [rmaData, setRmaData] = useState({ quantity: 1, reason: "", supplierName: "" });
  const [supplyData, setSupplyData] = useState({ quantity: 10, supplierName: "", agreedUnitPrice: 0 });
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

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
      console.error("Failed to fetch inventory");
    }
  };

  useEffect(() => {
    setIsMounted(true);
    if (user) {
      fetchParts();
      if (isManager) {
        axios.get("http://localhost:8080/api/auth/all", getAuthHeader())
          .then(res => setSupplierList(res.data.filter((u: any) => u.role === 'SUPPLIER')))
          .catch(() => console.error("Failed to fetch suppliers"));
      }
    }
  }, [user, isManager]);

  const onSubmit = async (data: PartFormInputs) => {
    try {
      if (editingPartId) {
        await axios.put(`http://localhost:8080/api/parts/${editingPartId}`, data, getAuthHeader());
        setModal({ isOpen: true, type: "success", title: "Update Successful", message: "Component details updated." });
        setEditingPartId(null);
      } else {
        await axios.post("http://localhost:8080/api/parts", data, getAuthHeader());
        setModal({ isOpen: true, type: "success", title: "Part Registered", message: "New spare part added." });
      }
      reset();
      fetchParts();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Action Failed", message: "Ensure Part Code is unique." });
    }
  };

  const handleEdit = (part: SparePart) => {
    const activeId = part.partID || part.partId || part.id;
    if (!activeId) return;
    setEditingPartId(activeId);
    setValue("partCode", part.partCode);
    setValue("name", part.name);
    setValue("category", part.category as any);
    setValue("unitPrice", part.unitPrice);
    setValue("currentStock", part.currentStock);
    setValue("minimumStockLevel", part.minimumStockLevel);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (targetId?: number) => {
    if (!targetId) return;
    if (!confirm("Confirm permanent deletion of this inventory record?")) return;
    try {
      await axios.delete(`http://localhost:8080/api/parts/${targetId}`, getAuthHeader());
      setModal({ isOpen: true, type: "success", title: "Record Deleted", message: "Component removed." });
      fetchParts();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Deletion Failed", message: "Tied to existing records." });
    }
  };

  const handleSubmitRma = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rmaModal.part) return;
    setIsSubmittingAction(true);
    try {
      const payload = {
        partName: rmaModal.part.name, partCode: rmaModal.part.partCode, quantity: rmaData.quantity,
        reason: rmaData.reason, supplierName: rmaData.supplierName, totalValue: rmaData.quantity * rmaModal.part.unitPrice
      };
      await axios.post("http://localhost:8080/api/rma/add", payload, getAuthHeader());
      setModal({ isOpen: true, type: "success", title: "RMA Logged", message: "Supplier notified of return." });
      setRmaModal({ isOpen: false, part: null });
      setRmaData({ quantity: 1, reason: "", supplierName: "" });
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "RMA Failed", message: "Failed to dispatch ticket." });
    } finally { setIsSubmittingAction(false); }
  };

  // --- NEW: INITIATE PURCHASE ORDER (PULL METHOD) ---
  const handleSubmitSupplyOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplyModal.part) return;
    setIsSubmittingAction(true);
    try {
      const payload = {
        supplierName: supplyData.supplierName,
        partCode: supplyModal.part.partCode,
        partName: supplyModal.part.name,
        category: supplyModal.part.category,
        quantityRequested: supplyData.quantity,
        agreedUnitPrice: supplyData.agreedUnitPrice
      };
      await axios.post("http://localhost:8080/api/supply/order", payload, getAuthHeader());
      setModal({ isOpen: true, type: "success", title: "Purchase Order Sent", message: "Supplier notified. Awaiting fulfillment." });
      setSupplyModal({ isOpen: false, part: null });
      setSupplyData({ quantity: 10, supplierName: "", agreedUnitPrice: 0 });
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Order Failed", message: "Failed to generate Purchase Order." });
    } finally { setIsSubmittingAction(false); }
  };

  if (!isMounted) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 md:p-12 relative">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10 animate-fade-in-up">
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Spare Parts Inventory</h1>
          <p className="text-slate-500 font-medium mt-2">{isManager ? "Manage automotive components, update details, and log defective RMA tickets." : "View authorized component catalog. Live storage data is restricted."}</p>
        </div>

        <div className={`grid grid-cols-1 ${isManager ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-8`}>
          {isManager && (
            <div className="lg:col-span-1 animate-fade-in-up">
              <div className={`bg-white p-8 rounded-3xl shadow-sm border ${editingPartId ? 'border-yellow-400 ring-4 ring-yellow-400/10' : 'border-slate-200'}`}>
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-bold text-slate-800">{editingPartId ? "Edit Component" : "Add Spare Part"}</h2>
                  {editingPartId && <button onClick={() => { setEditingPartId(null); reset(); }} className="text-xs font-bold text-slate-400">Cancel</button>}
                </div>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Part Code</label><input {...register("partCode")} disabled={!!editingPartId} type="text" className={`w-full px-4 py-2.5 rounded-xl border font-mono uppercase outline-none ${editingPartId ? 'bg-slate-100 cursor-not-allowed' : 'bg-slate-50 focus:border-blue-500'}`} /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Part Name</label><input {...register("name")} type="text" className="w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none focus:border-blue-500" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Category</label><select {...register("category")} className="w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none cursor-pointer"><option value="Engine">Engine</option><option value="Brakes">Brakes</option><option value="Suspension">Suspension</option><option value="Electrical">Electrical</option><option value="Consumables">Consumables</option></select></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Stock</label><input {...register("currentStock")} type="number" className="w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none" /></div>
                    <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Price (LKR)</label><input {...register("unitPrice")} type="number" step="0.01" className="w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none" /></div>
                  </div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Safety Alert Level</label><input {...register("minimumStockLevel")} type="number" className="w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none" /></div>
                  <button type="submit" disabled={isSubmitting} className="w-full text-white font-bold py-3.5 px-4 rounded-xl shadow-lg mt-2 bg-slate-900 hover:bg-blue-600">{isSubmitting ? "Processing..." : editingPartId ? "Update Details" : "Register to Inventory"}</button>
                </form>
              </div>
            </div>
          )}

          {!isManager && (
            <div className="lg:col-span-3 mb-4 bg-blue-50 border border-blue-100 p-6 rounded-3xl flex items-center justify-between">
              <div><h4 className="text-blue-900 font-black text-lg">Awaiting Orders?</h4><p className="text-blue-700 text-sm mt-1">Navigate to the Deliveries portal to view pending Purchase Orders.</p></div>
              <Link href="/deliveries" className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md">Go to Deliveries</Link>
            </div>
          )}

          <div className={`${isManager ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
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
                      {isManager && <><th className="px-6 py-4 text-right">Live Stock</th><th className="px-6 py-4 text-center">System Status</th><th className="px-6 py-4 text-right">Actions</th></>}
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700">
                    {parts.map((p, index) => {
                      const isLowStock = p.currentStock <= p.minimumStockLevel;
                      const uniqueId = p.partID || p.partId || p.id;
                      return (
                        <tr key={uniqueId || index} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-6 py-5">
                            <p className="text-slate-900 font-bold">{p.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{p.partCode}</span>
                              <span className="text-[10px] font-bold text-blue-600 uppercase">{p.category}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-right font-mono text-slate-600">Rs. {(p.unitPrice || 0).toLocaleString()}</td>
                          {isManager && (
                            <>
                              <td className="px-6 py-5 text-right"><span className={`font-black text-lg ${isLowStock ? 'text-red-600' : 'text-slate-900'}`}>{p.currentStock || 0}</span></td>
                              <td className="px-6 py-5 text-center">
                                {isLowStock ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black bg-red-50 text-red-600 border border-red-100"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>CRITICAL</span> : <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>OPTIMAL</span>}
                              </td>
                              <td className="px-6 py-5 text-right">
                                <div className="flex justify-end gap-1">
                                  {/* PULL METHOD: Request Stock Button */}
                                  <button onClick={() => { setSupplyModal({ isOpen: true, part: p }); setSupplyData({ ...supplyData, agreedUnitPrice: p.unitPrice }); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Request Restock (Purchase Order)">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                  </button>
                                  <button onClick={() => setRmaModal({ isOpen: true, part: p })} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg" title="Log Defective Part (RMA)">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                  </button>
                                  <button onClick={() => handleEdit(p)} className="p-2 text-slate-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg" title="Edit">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  </button>
                                  <button onClick={() => handleDelete(uniqueId)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Delete">
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

      {/* --- NEW: PURCHASE ORDER (SUPPLY REQUEST) MODAL --- */}
      {supplyModal.isOpen && supplyModal.part && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <div><h3 className="text-xl font-black text-slate-900">Request Stock Replenishment</h3><p className="text-xs font-bold text-blue-600 mt-1 uppercase tracking-widest">{supplyModal.part.partCode} • {supplyModal.part.name}</p></div>
              <button onClick={() => setSupplyModal({ isOpen: false, part: null })} className="p-2 text-slate-400 bg-slate-50 rounded-full">✕</button>
            </div>
            <form onSubmit={handleSubmitSupplyOrder} className="space-y-5">
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase mb-2">Target Supplier</label>
                <select required value={supplyData.supplierName} onChange={(e) => setSupplyData({ ...supplyData, supplierName: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 font-bold text-slate-800">
                  <option value="">-- Select Supplier --</option>
                  {supplierList.map((sup, idx) => (<option key={idx} value={sup.fullName || sup.username}>{sup.fullName || sup.username}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-600 uppercase mb-2">Order Qty</label>
                  <input type="number" min="1" required value={supplyData.quantity} onChange={(e) => setSupplyData({ ...supplyData, quantity: parseInt(e.target.value) || 1 })} className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-black text-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-600 uppercase mb-2">Agreed Unit Price</label>
                  <input type="number" step="0.01" required value={supplyData.agreedUnitPrice} onChange={(e) => setSupplyData({ ...supplyData, agreedUnitPrice: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-black text-slate-900" />
                </div>
              </div>
              <div className="p-4 bg-slate-900 rounded-xl text-white flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Expected PO Value</span>
                <span className="font-black text-lg">Rs. {(supplyData.quantity * supplyData.agreedUnitPrice).toLocaleString()}</span>
              </div>
              <button type="submit" disabled={isSubmittingAction} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl mt-2">{isSubmittingAction ? "Generating PO..." : "Send Purchase Order"}</button>
            </form>
          </div>
        </div>
      )}

      {/* --- RMA INITIATION MODAL --- */}
      {rmaModal.isOpen && rmaModal.part && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <div><h3 className="text-xl font-black text-slate-900">Initiate RMA</h3><p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">{rmaModal.part.partCode} • {rmaModal.part.name}</p></div>
              <button onClick={() => setRmaModal({ isOpen: false, part: null })} className="p-2 text-slate-400 bg-slate-50 rounded-full">✕</button>
            </div>
            <form onSubmit={handleSubmitRma} className="space-y-5">
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-widest mb-2">Target Supplier Name</label>
                <select required value={rmaData.supplierName} onChange={(e) => setRmaData({ ...rmaData, supplierName: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-orange-500 font-bold text-slate-800 cursor-pointer">
                  <option value="">-- Select Target Supplier --</option>
                  {supplierList.map((sup, idx) => (<option key={idx} value={sup.fullName || sup.username}>{sup.fullName || sup.username}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-black text-slate-600 uppercase mb-2">Defective Qty</label><input type="number" min="1" max={rmaModal.part.currentStock > 0 ? rmaModal.part.currentStock : undefined} required value={rmaData.quantity} onChange={(e) => setRmaData({ ...rmaData, quantity: parseInt(e.target.value) || 1 })} className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-black" /></div>
                <div><label className="block text-xs font-black text-slate-600 uppercase mb-2">Refund Value</label><div className="w-full px-4 py-3 rounded-xl border border-orange-200 bg-orange-50 font-black text-orange-700">Rs. {(rmaData.quantity * (rmaModal.part.unitPrice || 0)).toLocaleString()}</div></div>
              </div>
              <div><label className="block text-xs font-black text-slate-600 uppercase mb-2">Reason for Return</label><textarea required rows={3} value={rmaData.reason} onChange={(e) => setRmaData({ ...rmaData, reason: e.target.value })} className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-medium text-slate-700 resize-none" /></div>
              <button type="submit" disabled={isSubmittingAction} className="w-full bg-slate-900 hover:bg-orange-600 text-white font-black py-4 rounded-xl">{isSubmittingAction ? "Dispatching..." : "Submit RMA Request"}</button>
            </form>
          </div>
        </div>
      )}

      {/* Global Alert Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">{modal.title}</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">{modal.message}</p>
            <button onClick={() => setModal({ ...modal, isOpen: false })} className="w-full px-4 py-3 rounded-xl font-bold text-white bg-slate-900">Acknowledge</button>
          </div>
        </div>
      )}
    </div>
  );
}