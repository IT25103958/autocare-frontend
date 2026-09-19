"use client";

import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../context/AuthContext";

const invoiceSchema = z.object({
  supplierName: z.string()
    .min(2, "Supplier name must be at least 2 characters.")
    .max(100, "Name exceeds maximum limit.")
    .regex(/^[a-zA-Z0-9\s\-\.,&'()]+$/, "Contains invalid special characters."),
  supplyCategory: z.enum(["SPARE_PARTS", "FUEL", "EQUIPMENT", "MAINTENANCE"], {
    errorMap: () => ({ message: "Please select a valid category." }),
  }),
  totalInvoiceAmount: z.coerce.number()
    .min(0.01, "Amount must be greater than Rs. 0.")
    .max(100000000, "Amount exceeds enterprise transaction limits."),
  dueDate: z.string().min(1, "Due date is required."),
});

type InvoiceFormInputs = z.infer<typeof invoiceSchema>;

interface AccountsPayable {
  invoiceId: number;
  supplierName: string;
  supplyCategory: string;
  totalInvoiceAmount: number;
  amountPaid: number;
  status: string;
  dueDate: string;
}

export default function PayablesDashboard() {
  const { user } = useAuth();
  const [isMounted, setIsMounted] = useState(false);

  const [invoices, setInvoices] = useState<AccountsPayable[]>([]);
  const [retailRevenue, setRetailRevenue] = useState<any[]>([]); // NEW: State for POS Revenue
  const [paymentInputs, setPaymentInputs] = useState<{ [key: number]: string }>({});
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; invoiceId: number | null }>({
    isOpen: false,
    invoiceId: null,
  });

  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; type: "error" | "success" }>({
    isOpen: false,
    title: "",
    message: "",
    type: "error"
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InvoiceFormInputs>({
    resolver: zodResolver(invoiceSchema),
    mode: "onChange",
    defaultValues: { supplyCategory: "SPARE_PARTS" }
  });

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  const fetchData = async () => {
    try {
      // NEW: Parallel fetch for both Payables and POS Revenue
      const [payablesRes, posRes] = await Promise.all([
        axios.get("http://localhost:8080/api/payables/outstanding", getAuthHeader()),
        axios.get("http://localhost:8080/api/pos/history", getAuthHeader())
      ]);
      setInvoices(payablesRes.data);
      setRetailRevenue(posRes.data.reverse());
    } catch (err) {
      console.error("Failed to fetch financial data", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData();
  }, []);

  const onSubmit = async (data: InvoiceFormInputs) => {
    setServerMessage({ type: "", text: "" });
    try {
      const formattedAmount = Math.round((data.totalInvoiceAmount + Number.EPSILON) * 100) / 100;
      const payload = { ...data, totalInvoiceAmount: formattedAmount, amountPaid: 0.0 };

      await axios.post("http://localhost:8080/api/payables/add", payload, getAuthHeader());

      setServerMessage({ type: "success", text: "Invoice registered to ledger successfully." });
      reset();
      fetchData();
      setTimeout(() => {
        setServerMessage({ type: "", text: "" });
        setIsFormOpen(false);
      }, 2000);
    } catch (err: any) {
      setServerMessage({ type: "error", text: "Failed to securely log invoice." });
    }
  };

  const handlePayment = async (invoiceId: number, currentBalance: number) => {
    const rawInput = paymentInputs[invoiceId];

    if (!rawInput) return;

    const amountToPay = Math.round((parseFloat(rawInput) + Number.EPSILON) * 100) / 100;

    if (!amountToPay || amountToPay <= 0) {
      setAlertModal({ isOpen: true, type: "error", title: "Invalid Entry", message: "Please enter a payment amount greater than Rs. 0.00." });
      return;
    }

    if (amountToPay > currentBalance) {
      setAlertModal({
        isOpen: true,
        type: "error",
        title: "Overpayment Blocked",
        message: `The entered amount (Rs. ${amountToPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}) exceeds the outstanding balance of Rs. ${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`
      });
      return;
    }

    try {
      await axios.put(`http://localhost:8080/api/payables/${invoiceId}/pay?paymentAmount=${amountToPay}`, {}, getAuthHeader());
      setPaymentInputs({ ...paymentInputs, [invoiceId]: "" });

      const isFullyPaid = (amountToPay === currentBalance);
      setAlertModal({
        isOpen: true,
        type: "success",
        title: "Payment Processed",
        message: `Successfully paid Rs. ${amountToPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}. ${isFullyPaid ? "The invoice is fully settled." : "Balance updated to PARTIAL."}`
      });

      fetchData();
    } catch (err) {
      setAlertModal({ isOpen: true, type: "error", title: "Transaction Failed", message: "The server rejected the payment processing request." });
    }
  };

  const executeDelete = async () => {
    if (!deleteModal.invoiceId) return;
    try {
      await axios.delete(`http://localhost:8080/api/payables/${deleteModal.invoiceId}`, getAuthHeader());
      setAlertModal({ isOpen: true, type: "success", title: "Invoice Voided", message: "The selected supplier invoice has been permanently removed." });
      fetchData();
    } catch (err) {
      setAlertModal({ isOpen: true, type: "error", title: "Void Action Failed", message: "Unable to delete this invoice. It is locked by the system." });
    } finally {
      setDeleteModal({ isOpen: false, invoiceId: null });
    }
  };

  const { totalDebt, pendingCount, upcomingDue, totalPosRevenue } = useMemo(() => {
    let debt = 0;
    let pending = 0;
    let upcoming = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    nextWeek.setHours(23, 59, 59, 999);

    invoices.forEach(inv => {
      const balance = Math.round((inv.totalInvoiceAmount - inv.amountPaid) * 100) / 100;

      debt += balance;
      if (balance > 0) pending++;

      const dueDate = new Date(inv.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate >= today && dueDate <= nextWeek && balance > 0) {
        upcoming += balance;
      }
    });

    const posRev = retailRevenue.reduce((sum, txn) => sum + txn.totalRevenue, 0);

    return { totalDebt: debt, pendingCount: pending, upcomingDue: upcoming, totalPosRevenue: posRev };
  }, [invoices, retailRevenue]);

  const formatLKR = (amount: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);

  if (!isMounted) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12 relative">
      <div className="max-w-7xl mx-auto">

        {/* --- HEADER --- */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 animate-fade-in-up">
          <div>
            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Accounts Payable</h1>
            <p className="text-slate-500 font-medium mt-2">
              Manage incoming deliveries, track supplier debt ledgers, and process payments.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 font-bold rounded-xl shadow-sm transition-all text-sm flex items-center gap-2"
            >
              <svg className={`w-4 h-4 transition-transform duration-300 ${isFormOpen ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              {isFormOpen ? "Cancel Entry" : "New Delivery Receipt"}
            </button>
          </div>
        </div>

{/* --- DYNAMIC FINANCIAL SNAPSHOT --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <StatCard
            title="Retail Cash Income"
            value={formatLKR(totalPosRevenue)}
            trend="Over-The-Counter Sales"
            trendUp={true}
            delay="0.1s"
          />
          <StatCard
            title="Total Outstanding Debt"
            value={formatLKR(totalDebt)}
            trend={`${pendingCount} Active Invoices`}
            trendUp={totalDebt === 0}
            delay="0.2s"
          />
          <StatCard
            title="Payments Due (7 Days)"
            value={formatLKR(upcomingDue)}
            trend={upcomingDue > 0 ? "Requires attention" : "No immediate payments"}
            trendUp={upcomingDue === 0}
            delay="0.3s"
          />
          <StatCard
            title="Ledger Status"
            value={pendingCount > 0 ? "Pending" : "Cleared"}
            trend="All accounts processed"
            trendUp={pendingCount === 0}
            delay="0.4s"
          />
        </div>
        {/* --- TOGGLEABLE ADD INVOICE FORM --- */}
        {isFormOpen && (
          <div className="mb-10 bg-white p-8 rounded-3xl shadow-lg border border-blue-100 animate-fade-in-up">
            <h2 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Log New Supplier Invoice</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Supplier Name</label>
                <input {...register("supplierName")} type="text" placeholder="e.g., AutoParts Hub" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${errors.supplierName ? "border-red-500 focus:border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"}`} />
                {errors.supplierName && <p className="mt-1 text-xs font-bold text-red-500">{errors.supplierName.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Category</label>
                <select {...register("supplyCategory")} className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all cursor-pointer ${errors.supplyCategory ? "border-red-500 focus:border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"}`}>
                  <option value="SPARE_PARTS">Spare Parts</option>
                  <option value="FUEL">Fuel</option>
                  <option value="EQUIPMENT">Equipment</option>
                  <option value="MAINTENANCE">Maintenance</option>
                </select>
                {errors.supplyCategory && <p className="mt-1 text-xs font-bold text-red-500">{errors.supplyCategory.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Total Amount (Rs.)</label>
                <input {...register("totalInvoiceAmount")} type="number" step="0.01" placeholder="0.00" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${errors.totalInvoiceAmount ? "border-red-500 focus:border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"}`} />
                {errors.totalInvoiceAmount && <p className="mt-1 text-xs font-bold text-red-500">{errors.totalInvoiceAmount.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Due Date</label>
                <input {...register("dueDate")} type="date" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:ring-4 outline-none transition-all ${errors.dueDate ? "border-red-500 focus:border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"}`} />
                {errors.dueDate && <p className="mt-1 text-xs font-bold text-red-500">{errors.dueDate.message}</p>}
              </div>

              <div className="md:col-span-2 lg:col-span-4 flex items-center justify-between mt-2">
                <div className="flex-1">
                  {serverMessage.text && (
                    <span className={`text-sm font-bold px-4 py-2 rounded-lg ${serverMessage.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {serverMessage.text}
                    </span>
                  )}
                </div>
                <button type="submit" disabled={isSubmitting} className="px-8 py-3 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0">
                  {isSubmitting ? "Logging..." : "Add to Payables"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* --- RETAIL REVENUE LEDGER (NEW) --- */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden mb-10 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="px-8 py-6 border-b border-emerald-100 flex items-center justify-between bg-emerald-50/30">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Over-The-Counter Cash Log</h2>
              <p className="text-xs font-medium text-slate-500 mt-1">Live cash flow injected from the Inventory POS terminal</p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-white border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-400 font-black sticky top-0 shadow-sm z-10">
                  <th className="px-8 py-4">Transaction Ref</th>
                  <th className="px-8 py-4">Customer Details</th>
                  <th className="px-8 py-4">Items Summary</th>
                  <th className="px-8 py-4 text-right">Revenue Injected (Rs.)</th>
                </tr>
              </thead>
              <tbody className="text-sm font-medium text-slate-700">
                {retailRevenue.map((txn) => (
                  <tr key={txn.transactionId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4 font-mono text-xs text-slate-500">TXN-{txn.transactionId}</td>
                    <td className="px-8 py-4">
                      <div className="font-bold text-slate-900">{txn.customerName}</div>
                      <div className="text-[10px] text-slate-400 font-bold tracking-wider mt-0.5">{new Date(txn.transactionDate).toLocaleString()}</div>
                    </td>
                    <td className="px-8 py-4 whitespace-pre-line text-xs text-slate-600 leading-relaxed font-mono bg-slate-50/30 rounded-lg p-2 m-2 my-2 border border-slate-100">{txn.itemsSummary}</td>
                    <td className="px-8 py-4 text-right font-black text-emerald-600 text-lg">+{formatLKR(txn.totalRevenue)}</td>
                  </tr>
                ))}
                {retailRevenue.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-8 py-8 text-center text-slate-500 font-medium">No retail transactions logged yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- SUPPLIER DEBT LEDGER TABLE --- */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-xl font-bold text-slate-900">Supplier Debt Ledger</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-white border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-400 font-black">
                  <th className="px-8 py-4">Supplier Details</th>
                  <th className="px-8 py-4">Due Date</th>
                  <th className="px-8 py-4">Amount Due</th>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4 text-right">Process Payment</th>
                </tr>
              </thead>
              <tbody className="text-sm font-medium text-slate-700">
                {invoices.map((inv) => {
                  const balance = Math.round((inv.totalInvoiceAmount - inv.amountPaid) * 100) / 100;

                  const todayNormalized = new Date();
                  todayNormalized.setHours(0, 0, 0, 0);
                  const dueDateNormalized = new Date(inv.dueDate);
                  dueDateNormalized.setHours(0, 0, 0, 0);

                  const isOverdue = dueDateNormalized < todayNormalized && balance > 0;

                  let displayStatus = inv.status;
                  if (balance <= 0) displayStatus = "PAID";
                  else if (inv.amountPaid > 0 && balance > 0) displayStatus = "PARTIAL";
                  else if (isOverdue) displayStatus = "OVERDUE";

                  return (
                    <tr key={inv.invoiceId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="font-bold text-slate-900">{inv.supplierName}</div>
                        <div className="text-xs text-blue-600 font-bold mt-0.5 tracking-wider">{inv.supplyCategory.replace('_', ' ')}</div>
                      </td>
                      <td className="px-8 py-5 text-slate-600 font-mono">{inv.dueDate}</td>
                      <td className="px-8 py-5 font-bold text-slate-900">{formatLKR(balance)}</td>
                      <td className="px-8 py-5">
                        <span className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md border ${
                          displayStatus === 'OVERDUE' ? 'bg-red-50 text-red-600 border-red-200' :
                          displayStatus === 'PARTIAL' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' :
                          displayStatus === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                          displayStatus === 'APPROVED' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                          'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {displayStatus}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex justify-end gap-2 items-center">
                          {balance > 0 ? (
                            <>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="Rs. Amount"
                                className="px-3 py-2 border border-slate-200 rounded-lg w-28 text-xs font-bold focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all bg-white"
                                value={paymentInputs[inv.invoiceId] || ""}
                                onChange={(e) => setPaymentInputs({...paymentInputs, [inv.invoiceId]: e.target.value})}
                              />
                              <button
                                onClick={() => handlePayment(inv.invoiceId, balance)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors text-xs active:scale-95"
                              >
                                Pay
                              </button>
                            </>
                          ) : (
                            <span className="text-xs font-bold text-emerald-600 flex items-center justify-end gap-1.5 px-2">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                              Settled
                            </span>
                          )}

                          <button
                            onClick={() => setDeleteModal({ isOpen: true, invoiceId: inv.invoiceId })}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2"
                            title="Void Invoice"
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
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-8 py-12 text-center text-slate-500 font-medium">
                      No outstanding invoices found. The ledger is clear!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* --- CONFIRMATION MODAL FOR DELETION --- */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-sm w-full border border-slate-200 transform transition-all">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4 mx-auto">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-center text-slate-900 mb-2">Void Invoice?</h3>
            <p className="text-slate-500 text-sm text-center mb-8 font-medium">
              Are you sure you want to permanently delete this record from the accounts payable ledger? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteModal({ isOpen: false, invoiceId: null })} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={executeDelete} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-md transition-all active:scale-95">
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- NOTIFICATION / ALERT MODAL --- */}
      {alertModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-sm w-full border border-slate-200 transform transition-all text-center">

            <div className={`flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto ${alertModal.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={alertModal.type === 'success' ? "M5 13l4 4L19 7" : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"} />
              </svg>
            </div>

            <h3 className="text-xl font-bold text-slate-900 mb-2">{alertModal.title}</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">{alertModal.message}</p>
            <button onClick={() => setAlertModal({ ...alertModal, isOpen: false })} className={`w-full px-4 py-3 rounded-xl font-bold text-white shadow-md transition-all active:scale-95 ${alertModal.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'}`}>
              Acknowledge
            </button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
      `}} />
    </div>
  );
}

function StatCard({ title, value, trend, trendUp, delay }: { title: string, value: string, trend: string, trendUp: boolean, delay: string }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: delay }}>
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</h3>
      <div className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight mb-3 truncate" title={value}>{value}</div>
      <div className={`text-xs font-bold flex items-center gap-1.5 ${trendUp ? 'text-emerald-600' : 'text-red-500'}`}>
        {!trendUp ? (
           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
        ) : (
           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
        )}
        {trend}
      </div>
    </div>
  );
}