"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../context/AuthContext";

// --- SUPPLIER SUBMISSION SCHEMA ---
const deliverySchema = z.object({
  totalInvoiceAmount: z.coerce.number().min(0.01, "Amount must be greater than Rs. 0."),
  dueDate: z.string().min(1, "Due date is required."),
  partCode: z.string().min(2, "Part code is required (e.g. BRK-01)."),
  partName: z.string().min(2, "Part name is required."),
  partCategory: z.enum(["Engine", "Brakes", "Suspension", "Electrical", "Consumables"]),
  quantity: z.coerce.number().int("Decimals are not allowed.").min(1, "Quantity must be at least 1."),
});

// --- ADMIN APPROVAL SCHEMA ---
const approvalSchema = z.object({
  approvePartCode: z.string().min(2, "Required."),
  approvePartName: z.string().min(2, "Required."),
  approveCategory: z.enum(["Engine", "Brakes", "Suspension", "Electrical", "Consumables"]),
  approveQuantity: z.coerce.number().int("Decimals are not allowed.").min(1, "Must be at least 1."),
  approveUnitPrice: z.coerce.number().min(0.01, "Unit price must be calculated and entered."),
});

type DeliveryFormInputs = z.infer<typeof deliverySchema>;
type ApprovalFormInputs = z.infer<typeof approvalSchema>;

export default function SupplierDashboard() {
  const { user } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [approvingInvoice, setApprovingInvoice] = useState<any | null>(null);

  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" }>({
    isOpen: false, title: "", message: "", type: "success"
  });

  const isManager = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "INVENTORY_MANAGER";

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<DeliveryFormInputs>({
    resolver: zodResolver(deliverySchema),
    mode: "onChange",
    defaultValues: { partCategory: "Engine" }
  });

  const { register: regApprove, handleSubmit: handleApproveSubmit, reset: resetApprove, formState: { errors: approveErrors } } = useForm<ApprovalFormInputs>({
    resolver: zodResolver(approvalSchema),
    defaultValues: { approveCategory: "Engine" }
  });

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  const fetchSupplierHistory = async () => {
    try {
      const res = await axios.get("http://localhost:8080/api/payables/outstanding", getAuthHeader());
      if (isManager) {
        const allPartsDispatches = res.data.filter((inv: any) => inv.supplyCategory === "SPARE_PARTS");
        setHistoryItems(allPartsDispatches);
      } else {
        const supplierName = user?.fullName || user?.username;
        const myDispatches = res.data.filter((inv: any) =>
          inv.supplierName === supplierName && inv.supplyCategory === "SPARE_PARTS"
        );
        setHistoryItems(myDispatches);
      }
    } catch (err) {
      console.error("Failed to load history.", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    if (user) fetchSupplierHistory();
  }, [user]);

  // SUPPLIER ACTION: Submit Invoice
  const onSubmit = async (data: DeliveryFormInputs) => {
    try {
      const supplierName = user?.fullName || user?.username || "Unknown Supplier";
      const payablePayload = {
        supplierName: supplierName,
        supplyCategory: "SPARE_PARTS",
        totalInvoiceAmount: data.totalInvoiceAmount,
        dueDate: data.dueDate,
        status: "UNPAID"
      };

      await axios.post("http://localhost:8080/api/payables/add", payablePayload, getAuthHeader());
      setModal({ isOpen: true, type: "success", title: "Delivery Logged", message: "Your dispatch invoice has been securely transmitted for administrative approval." });
      reset();
      fetchSupplierHistory();
    } catch (err: any) {
      setModal({ isOpen: true, type: "error", title: "Action Failed", message: "Transaction failed. Please check your inputs." });
    }
  };

  // ADMIN ACTION: Approve Invoice & Log Inventory
  const onApproveConfirm = async (data: ApprovalFormInputs) => {
    try {
      // 1. Update Finance Ledger to APPROVED
      const payablePayload = { ...approvingInvoice, status: "APPROVED" };
      await axios.put(`http://localhost:8080/api/payables/${approvingInvoice.invoiceId}`, payablePayload, getAuthHeader());

      // 2. Inject Physical Stock into Parts Database
      const inventoryPayload = {
        partCode: data.approvePartCode,
        name: data.approvePartName,
        category: data.approveCategory,
        unitPrice: data.approveUnitPrice,
        currentStock: data.approveQuantity,
        minimumStockLevel: 5 // Enterprise Default Setting
      };
      await axios.post("http://localhost:8080/api/parts", inventoryPayload, getAuthHeader());

      setModal({ isOpen: true, type: "success", title: "Request Approved", message: "Invoice verified. The finance ledger and live inventory database have been updated." });
      setApprovingInvoice(null);
      resetApprove();
      fetchSupplierHistory();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Approval Failed", message: "Failed to process the approval. Ensure part codes are unique." });
    }
  };

  const handleDelete = async (invoiceId: number) => {
    if (!confirm("Permanently reject and delete this invoice request?")) return;
    try {
      await axios.delete(`http://localhost:8080/api/payables/${invoiceId}`, getAuthHeader());
      setModal({ isOpen: true, type: "success", title: "Request Rejected", message: "The dispatch request has been removed." });
      fetchSupplierHistory();
    } catch (err) {
      setModal({ isOpen: true, type: "error", title: "Action Failed", message: "Cannot remove this record." });
    }
  };

  if (!isMounted) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12 relative">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10 animate-fade-in-up">
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Spare Parts Dispatch</h1>
          <p className="text-slate-500 font-medium mt-2">
            Welcome back, <span className="font-bold text-slate-700">{user?.fullName || user?.username}</span>.
            {isManager ? " Review and approve incoming supplier deliveries." : " Register your component deliveries and request payments."}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* LEFT: SUPPLIER FORM (Hidden from Managers for clean UI) */}
          {!isManager && (
            <div className="lg:col-span-1 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">📦</div>
                  <h2 className="text-xl font-bold text-slate-800">Submit Delivery</h2>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Supplier Profile</label>
                    <input type="text" value={user?.fullName || user?.username || ""} disabled className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed font-medium" />
                  </div>

                  <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 space-y-4">
                    <h4 className="text-xs font-black text-blue-800 uppercase tracking-wider mb-2">Delivery Manifest</h4>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <input {...register("partCode")} type="text" placeholder="Code (BRK-01)" className={`w-full px-3 py-2 rounded-lg border text-sm uppercase outline-none ${errors.partCode ? 'border-red-500' : 'border-slate-200 focus:border-blue-500'}`} />
                        {errors.partCode && <p className="mt-1 text-[10px] font-bold text-red-500">{errors.partCode.message}</p>}
                      </div>
                      <div>
                        <select {...register("partCategory")} className="w-full px-3 py-2 rounded-lg border text-sm outline-none bg-white border-slate-200 focus:border-blue-500 cursor-pointer">
                          <option value="Engine">Engine</option>
                          <option value="Brakes">Brakes</option>
                          <option value="Suspension">Suspension</option>
                          <option value="Electrical">Electrical</option>
                          <option value="Consumables">Consumables</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <input {...register("partName")} type="text" placeholder="Part Name" className={`w-full px-3 py-2 rounded-lg border text-sm outline-none bg-white ${errors.partName ? 'border-red-500' : 'border-slate-200 focus:border-blue-500'}`} />
                      {errors.partName && <p className="mt-1 text-[10px] font-bold text-red-500">{errors.partName.message}</p>}
                    </div>

                    <div>
                      <input {...register("quantity")} type="number" step="1" placeholder="Quantity Delivered" className={`w-full px-3 py-2 rounded-lg border text-sm outline-none bg-white ${errors.quantity ? 'border-red-500' : 'border-slate-200 focus:border-blue-500'}`} />
                      {errors.quantity && <p className="mt-1 text-[10px] font-bold text-red-500">{errors.quantity.message}</p>}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Expected Invoice Amount (LKR)</label>
                    <input {...register("totalInvoiceAmount")} type="number" step="0.01" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none transition-all font-mono ${errors.totalInvoiceAmount ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                    {errors.totalInvoiceAmount && <p className="mt-1.5 text-[11px] font-bold text-red-500">{errors.totalInvoiceAmount.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Requested Payment Date</label>
                    <input {...register("dueDate")} type="date" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none transition-all ${errors.dueDate ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                    {errors.dueDate && <p className="mt-1.5 text-[11px] font-bold text-red-500">{errors.dueDate.message}</p>}
                  </div>

                  <button type="submit" disabled={isSubmitting} className="w-full text-white font-bold py-3.5 px-4 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 mt-2 bg-slate-900 hover:bg-blue-600">
                    {isSubmitting ? "Transmitting..." : "Submit Invoice Request"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* RIGHT/FULL: DYNAMIC HISTORY TABLE */}
          <div className={`${isManager ? 'lg:col-span-3' : 'lg:col-span-2'} animate-fade-in-up`} style={{ animationDelay: '0.2s' }}>
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 h-full">
              <h3 className="text-xl font-bold text-slate-800 mb-6">{isManager ? "Pending Supplier Requests" : "My Submission History"}</h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="pb-3 pr-4">Due Date</th>
                      {isManager && <th className="pb-3 pr-4">Supplier</th>}
                      <th className="pb-3 pr-4 text-right">Invoice Amount</th>
                      <th className="pb-3 text-center">System Status</th>
                      {isManager && <th className="pb-3 text-right">Manager Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700">
                    {historyItems.map((item, index) => (
                      <tr key={index} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 pr-4 text-slate-500 font-mono">{item.dueDate}</td>
                        {isManager && <td className="py-4 pr-4 font-bold text-slate-800">{item.supplierName}</td>}
                        <td className="py-4 pr-4 text-right font-mono font-bold text-slate-900">Rs. {item.totalInvoiceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-4 text-center">
                           <span className={`px-3 py-1 border rounded-md text-[10px] font-black uppercase tracking-wider ${
                             item.status === 'UNPAID' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                             item.status === 'PARTIAL' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                             'bg-emerald-50 text-emerald-700 border-emerald-200'
                           }`}>
                             {item.status === 'UNPAID' ? 'PENDING' : item.status}
                           </span>
                        </td>

                        {/* ONLY MANAGERS SEE APPROVE/DELETE */}
                        {isManager && (
                          <td className="py-4 text-right">
                            <div className="flex justify-end gap-2">
                              {item.status === 'UNPAID' ? (
                                <button onClick={() => setApprovingInvoice(item)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-md transition-all active:scale-95 flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                                  Verify & Log
                                </button>
                              ) : (
                                <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5 justify-end px-3 py-1.5">
                                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                                  Approved
                                </span>
                              )}
                              <button onClick={() => handleDelete(item.invoiceId)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Reject Request">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {historyItems.length === 0 && (
                      <tr>
                        <td colSpan={isManager ? 5 : 4} className="text-center py-12 text-slate-500 font-medium">No dispatch records found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- ADMIN APPROVAL MODAL (BLIND RECEIVING) --- */}
      {approvingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Verify Physical Stock</h3>
            <p className="text-slate-500 text-sm mb-6">Register the physical stock received from <strong>{approvingInvoice.supplierName}</strong> to approve the invoice.</p>

            <form onSubmit={handleApproveSubmit(onApproveConfirm)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Part Code</label>
                  <input {...regApprove("approvePartCode")} type="text" className={`w-full px-3 py-2 rounded-lg border outline-none uppercase text-sm ${approveErrors.approvePartCode ? 'border-red-500' : 'border-slate-200 focus:border-blue-500'}`} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Category</label>
                  <select {...regApprove("approveCategory")} className="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-blue-500 text-sm cursor-pointer">
                    <option value="Engine">Engine</option>
                    <option value="Brakes">Brakes</option>
                    <option value="Suspension">Suspension</option>
                    <option value="Electrical">Electrical</option>
                    <option value="Consumables">Consumables</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Part Name</label>
                <input {...regApprove("approvePartName")} type="text" className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${approveErrors.approvePartName ? 'border-red-500' : 'border-slate-200 focus:border-blue-500'}`} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Received Quantity</label>
                  <input {...regApprove("approveQuantity")} type="number" step="1" className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${approveErrors.approveQuantity ? 'border-red-500' : 'border-slate-200 focus:border-blue-500'}`} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Calculated Unit Price</label>
                  <input {...regApprove("approveUnitPrice")} type="number" step="0.01" className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${approveErrors.approveUnitPrice ? 'border-red-500' : 'border-slate-200 focus:border-blue-500'}`} />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-2">
                 <div className="flex justify-between text-xs font-bold text-slate-500"><span>Billed Invoice Amount:</span> <span>Rs. {approvingInvoice.totalInvoiceAmount.toLocaleString()}</span></div>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setApprovingInvoice(null); resetApprove(); }} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-all active:scale-95">Confirm & Inject Stock</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- SUCCESS/ERROR MODAL --- */}
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