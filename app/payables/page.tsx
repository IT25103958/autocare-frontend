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

interface PaymentRecord {
  amountPaid: number;
  paymentDate: string;
  processedBy: string;
}

interface AccountsPayable {
  invoiceId: number;
  supplierName: string;
  supplyCategory: string;
  totalInvoiceAmount: number;
  amountPaid: number;
  status: string;
  dueDate: string;
  paymentHistory: PaymentRecord[];
}

interface ServiceBooking {
  bookingID: number;
  vehicleRegNo: string;
  servicePackage: string;
  status: string;
  totalPartsCost: number;
  preferredDate: string;
}

interface RmaRefund {
  id: number;
  partName: string;
  partCode: string;
  quantity: number;
  reason: string;
  supplierName: string;
  totalValue: number;
  status: string;
  financialStatus: string;
  dateLogged: string;
}

type TabType = "PAYABLES" | "RMA_CREDITS" | "REVENUE";

export default function PayablesDashboard() {
  const { user } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("PAYABLES");

  const [invoices, setInvoices] = useState<AccountsPayable[]>([]);
  const [retailRevenue, setRetailRevenue] = useState<any[]>([]);
  const [workshopRevenue, setWorkshopRevenue] = useState<ServiceBooking[]>([]);
  const [rmas, setRmas] = useState<RmaRefund[]>([]);

  const [paymentInputs, setPaymentInputs] = useState<{ [key: number]: string }>({});
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [historyModal, setHistoryModal] = useState<AccountsPayable | null>(null);

  // Offset & Settlement Modal State
  const [settlementModal, setSettlementModal] = useState<{
    isOpen: boolean;
    rma: RmaRefund | null;
    method: "CASH" | "OFFSET";
    targetInvoiceId: number | null;
  }>({
    isOpen: false,
    rma: null,
    method: "OFFSET",
    targetInvoiceId: null,
  });

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
    defaultValues: { supplyCategory: "FUEL" }
  });

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  const fetchData = async () => {
    try {
      const [payablesRes, posRes, bookingsRes, rmaRes] = await Promise.all([
        axios.get("http://localhost:8080/api/payables/outstanding", getAuthHeader()).catch(() => ({ data: [] })),
        axios.get("http://localhost:8080/api/pos/history", getAuthHeader()).catch(() => ({ data: [] })),
        axios.get("http://localhost:8080/api/bookings", getAuthHeader()).catch(() => ({ data: [] })),
        axios.get("http://localhost:8080/api/rma", getAuthHeader()).catch(() => ({ data: [] }))
      ]);

      setInvoices(payablesRes.data);

      if (Array.isArray(posRes.data)) setRetailRevenue(posRes.data.reverse());
      if (Array.isArray(bookingsRes.data)) {
        setWorkshopRevenue(bookingsRes.data.filter((b: ServiceBooking) => b.status === "PAID" || b.status === "COMPLETED").sort((a, b) => b.bookingID - a.bookingID));
      }

      if (Array.isArray(rmaRes.data)) {
        const financialRmas = rmaRes.data.filter((r: RmaRefund) =>
          r.status === "APPROVED_REFUND" || r.financialStatus === "SETTLED"
        );
        setRmas(financialRmas);
      }
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
      setAlertModal({ isOpen: true, type: "error", title: "Overpayment Blocked", message: "Amount exceeds the outstanding balance." });
      return;
    }

    try {
      await axios.put(`http://localhost:8080/api/payables/${invoiceId}/pay?paymentAmount=${amountToPay}`, {}, getAuthHeader());
      setPaymentInputs({ ...paymentInputs, [invoiceId]: "" });

      const isFullyPaid = (amountToPay === currentBalance);
      setAlertModal({
        isOpen: true, type: "success", title: "Payment Processed",
        message: `Successfully disbursed Rs. ${amountToPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}. ${isFullyPaid ? "The invoice is fully settled." : "Balance updated to PARTIAL."}`
      });

      fetchData();
    } catch (err) {
      setAlertModal({ isOpen: true, type: "error", title: "Transaction Failed", message: "Server rejected the payment processing request." });
    }
  };

  const openSettlementModal = (rma: RmaRefund) => {
    // Find active unpaid invoices for this supplier to pre-select
    const matchingInvoice = invoices.find(inv =>
      inv.supplierName.toLowerCase() === rma.supplierName.toLowerCase() &&
      (inv.totalInvoiceAmount - inv.amountPaid) > 0
    );

    setSettlementModal({
      isOpen: true,
      rma,
      method: matchingInvoice ? "OFFSET" : "CASH",
      targetInvoiceId: matchingInvoice ? matchingInvoice.invoiceId : null
    });
  };

  const executeSettlement = async () => {
    const { rma, method, targetInvoiceId } = settlementModal;
    if (!rma) return;

    try {
      if (method === "OFFSET") {
        if (!targetInvoiceId) {
          setAlertModal({ isOpen: true, type: "error", title: "Target Missing", message: "Please select an active invoice to offset this credit against." });
          return;
        }

        const invoice = invoices.find(i => i.invoiceId === targetInvoiceId);
        if (!invoice) return;

        const balance = Math.round((invoice.totalInvoiceAmount - invoice.amountPaid) * 100) / 100;
        const offsetAmount = Math.min(balance, rma.totalValue);

        // 1. Apply credit as installment on the target invoice
        await axios.put(`http://localhost:8080/api/payables/${targetInvoiceId}/pay?paymentAmount=${offsetAmount}`, {}, getAuthHeader());

        // 2. Mark RMA as settled
        await axios.put(`http://localhost:8080/api/rma/${rma.id}/settle`, {}, getAuthHeader());

        setAlertModal({
          isOpen: true,
          type: "success",
          title: "Credit Note Offset Applied",
          message: `Successfully offset Rs. ${offsetAmount.toLocaleString()} against Invoice #${targetInvoiceId}. RMA #${rma.id} is settled.`
        });
      } else {
        // Direct cash/bank deposit collection
        await axios.put(`http://localhost:8080/api/rma/${rma.id}/settle`, {}, getAuthHeader());
        setAlertModal({
          isOpen: true,
          type: "success",
          title: "Refund Collected",
          message: `RMA #${rma.id} of Rs. ${rma.totalValue.toLocaleString()} marked as direct deposit settlement.`
        });
      }

      setSettlementModal({ isOpen: false, rma: null, method: "OFFSET", targetInvoiceId: null });
      fetchData();
    } catch (err) {
      setAlertModal({ isOpen: true, type: "error", title: "Settlement Failed", message: "Unable to process the RMA settlement." });
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

  const { totalDebt, pendingCount, overdueCount, upcomingDue, totalIncome, unsettledRmaCount, unsettledRmaTotal, ledgerStatus, isLedgerHealthy } = useMemo(() => {
    let debt = 0; let pending = 0; let overdue = 0; let upcoming = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(); nextWeek.setDate(today.getDate() + 7); nextWeek.setHours(23, 59, 59, 999);

    invoices.forEach(inv => {
      const balance = Math.round((inv.totalInvoiceAmount - inv.amountPaid) * 100) / 100;
      debt += balance;
      if (balance > 0) pending++;
      const dueDate = new Date(inv.dueDate); dueDate.setHours(0, 0, 0, 0);
      if (dueDate < today && balance > 0) overdue++;
      if (dueDate >= today && dueDate <= nextWeek && balance > 0) upcoming += balance;
    });

    const posRev = retailRevenue.reduce((sum, txn) => sum + txn.totalRevenue, 0);
    const workshopRev = workshopRevenue.reduce((sum, job) => sum + (job.totalPartsCost || 0), 0);
    const settledRmaRev = rmas.filter(r => r.financialStatus === 'SETTLED').reduce((sum, r) => sum + (r.totalValue || 0), 0);

    const unsettledList = rmas.filter(r => r.financialStatus === 'UNSETTLED');
    const unsettledTotal = unsettledList.reduce((sum, r) => sum + (r.totalValue || 0), 0);

    let status = "CLEARED"; let healthy = true;
    if (overdue > 0) { status = "OVERDUE"; healthy = false; }
    else if (pending > 0) { status = "PENDING"; healthy = true; }

    return {
      totalDebt: debt,
      pendingCount: pending,
      overdueCount: overdue,
      upcomingDue: upcoming,
      totalIncome: posRev + workshopRev + settledRmaRev,
      unsettledRmaCount: unsettledList.length,
      unsettledRmaTotal: unsettledTotal,
      ledgerStatus: status,
      isLedgerHealthy: healthy
    };
  }, [invoices, retailRevenue, workshopRevenue, rmas]);

  const formatLKR = (amount: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);

  if (!isMounted) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12 relative">
      <div className="max-w-[1400px] mx-auto">

        {/* --- HEADER --- */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Master Ledger & Financial Control</h1>
            <p className="text-slate-500 font-medium mt-2">Manage supplier payables, credit note offsets, and inbound workshop revenues.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setIsFormOpen(true)} className="px-6 py-3 bg-slate-900 text-white hover:bg-blue-600 font-bold rounded-xl shadow-lg transition-all text-sm flex items-center gap-2">
              + Log Utility/Fuel Bill
            </button>
          </div>
        </div>

        {/* --- SMART ACTION CENTER BANNER --- */}
        {(overdueCount > 0 || unsettledRmaCount > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {overdueCount > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
                  <div>
                    <h4 className="font-black text-red-900 text-sm">Critical: {overdueCount} Overdue Invoice(s)</h4>
                    <p className="text-xs text-red-700">Immediate supplier disbursement required.</p>
                  </div>
                </div>
                <button onClick={() => setActiveTab("PAYABLES")} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700">
                  View Overdue
                </button>
              </div>
            )}
            {unsettledRmaCount > 0 && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                  <div>
                    <h4 className="font-black text-emerald-900 text-sm">{unsettledRmaCount} Approved RMA Credit(s) Ready</h4>
                    <p className="text-xs text-emerald-700">{formatLKR(unsettledRmaTotal)} ready for cash recovery or invoice offset.</p>
                  </div>
                </div>
                <button onClick={() => setActiveTab("RMA_CREDITS")} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">
                  Review Credits
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- KPI SUMMARY METRICS --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Cash Inflow" value={formatLKR(totalIncome)} trend="Workshop, Retail & Settled RMA" trendUp={true} delay="0.1s" />
          <StatCard title="Total Supplier Debt" value={formatLKR(totalDebt)} trend={`${pendingCount} Active Invoices`} trendUp={totalDebt === 0} delay="0.2s" />
          <StatCard title="Due In 7 Days" value={formatLKR(upcomingDue)} trend={upcomingDue > 0 ? "Requires Attention" : "Clear for 7 Days"} trendUp={upcomingDue === 0} delay="0.3s" />
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Ledger Health</h3>
            <div className={`text-2xl lg:text-3xl font-black tracking-tight mb-2 ${isLedgerHealthy ? 'text-emerald-600' : 'text-red-600 animate-pulse'}`}>
              {ledgerStatus}
            </div>
            <div className="text-xs font-bold text-slate-500">
              {overdueCount > 0 ? `${overdueCount} bills past deadline` : "Operating normally"}
            </div>
          </div>
        </div>

        {/* --- TAB NAVIGATION BAR --- */}
        <div className="flex border-b border-slate-200 mb-8 gap-4">
          <button
            onClick={() => setActiveTab("PAYABLES")}
            className={`pb-4 px-2 font-black text-sm uppercase tracking-wider transition-all relative ${
              activeTab === "PAYABLES" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-400 hover:text-slate-700"
            }`}
          >
            Supplier Payables & Debt ({pendingCount})
          </button>
          <button
            onClick={() => setActiveTab("RMA_CREDITS")}
            className={`pb-4 px-2 font-black text-sm uppercase tracking-wider transition-all relative ${
              activeTab === "RMA_CREDITS" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-400 hover:text-slate-700"
            }`}
          >
            Supplier Credits & RMA ({rmas.length})
            {unsettledRmaCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 rounded-full font-bold">
                {unsettledRmaCount} Action
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("REVENUE")}
            className={`pb-4 px-2 font-black text-sm uppercase tracking-wider transition-all relative ${
              activeTab === "REVENUE" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-400 hover:text-slate-700"
            }`}
          >
            Inbound Revenue Streams
          </button>
        </div>

        {/* --- TAB 1: SUPPLIER DEBT & INVOICES --- */}
        {activeTab === "PAYABLES" && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in-up">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Accounts Payable Ledger</h3>
                <p className="text-xs font-medium text-slate-500 mt-1">Verified supplier bills, purchase order liabilities, and payment fulfillment.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-white border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-6 py-4">#</th>
                    <th className="px-6 py-4">Supplier & Category</th>
                    <th className="px-6 py-4">Due Date</th>
                    <th className="px-6 py-4 text-right">Invoice Total</th>
                    <th className="px-6 py-4 text-right">Balance Due</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Disbursement</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                  {invoices.map((inv, index) => {
                    const balance = Math.round((inv.totalInvoiceAmount - inv.amountPaid) * 100) / 100;
                    const todayNormalized = new Date(); todayNormalized.setHours(0, 0, 0, 0);
                    const dueDateNormalized = new Date(inv.dueDate); dueDateNormalized.setHours(0, 0, 0, 0);
                    const isOverdue = dueDateNormalized < todayNormalized && balance > 0;

                    let displayStatus = inv.status;
                    if (balance <= 0) displayStatus = "PAID";
                    else if (inv.amountPaid > 0 && balance > 0) displayStatus = "PARTIAL";
                    else if (isOverdue) displayStatus = "OVERDUE";

                    return (
                      <tr key={inv.invoiceId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-5 font-black text-slate-400">{index + 1}</td>
                        <td className="px-6 py-5">
                          <div className="font-bold text-slate-900">{inv.supplierName}</div>
                          <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">{inv.supplyCategory.replace('_', ' ')}</div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`font-mono text-xs ${isOverdue ? 'text-red-600 font-bold' : 'text-slate-600'}`}>{inv.dueDate}</span>
                        </td>
                        <td className="px-6 py-5 text-right font-mono text-slate-500">
                          {formatLKR(inv.totalInvoiceAmount)}
                        </td>
                        <td className="px-6 py-5 text-right font-mono font-black text-slate-900 text-base">
                          {formatLKR(balance)}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded border ${
                            displayStatus === 'OVERDUE' ? 'bg-red-50 text-red-600 border-red-200' :
                            displayStatus === 'PARTIAL' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' :
                            displayStatus === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {displayStatus}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex justify-end gap-2 items-center">
                            {inv.paymentHistory?.length > 0 && (
                              <button onClick={() => setHistoryModal(inv)} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline mr-2">
                                History
                              </button>
                            )}
                            {balance > 0 ? (
                              <>
                                <input
                                  type="number" step="0.01" placeholder="Rs."
                                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 w-24 text-right"
                                  value={paymentInputs[inv.invoiceId] || ""}
                                  onChange={(e) => setPaymentInputs({...paymentInputs, [inv.invoiceId]: e.target.value})}
                                />
                                <button onClick={() => handlePayment(inv.invoiceId, balance)} className="px-3.5 py-1.5 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-lg shadow-sm text-[10px] uppercase tracking-wider transition-all">
                                  Pay
                                </button>
                              </>
                            ) : (
                              <span className="text-xs font-bold text-emerald-600 pr-2">Settled</span>
                            )}
                            <button onClick={() => setDeleteModal({ isOpen: true, invoiceId: inv.invoiceId })} className="p-1.5 text-slate-300 hover:text-red-500 rounded" title="Void Bill">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {invoices.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400">No active payables found in the ledger.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TAB 2: RMA CREDITS & OFFSETTING --- */}
        {activeTab === "RMA_CREDITS" && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in-up">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Supplier Credit Notes & Warranty Recoveries</h3>
                <p className="text-xs font-medium text-slate-500 mt-1">Offset approved RMA claims against active invoices or collect direct cash deposits.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-white border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-6 py-4">RMA Ref</th>
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4">Defective Component</th>
                    <th className="px-6 py-4 text-right">Credit Value</th>
                    <th className="px-6 py-4 text-center">Settlement Status</th>
                    <th className="px-6 py-4 text-right">Financial Action</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                  {rmas.map((rma) => (
                    <tr key={rma.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5 font-mono text-xs text-slate-500 font-bold">RMA-{rma.id.toString().padStart(4, '0')}</td>
                      <td className="px-6 py-5 font-bold text-slate-900">{rma.supplierName}</td>
                      <td className="px-6 py-5">
                        <div className="font-bold text-slate-900">{rma.partName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{rma.partCode} • Qty {rma.quantity}</div>
                      </td>
                      <td className="px-6 py-5 text-right font-black text-emerald-600 text-base">
                        +{formatLKR(rma.totalValue)}
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded border ${
                          rma.financialStatus === 'SETTLED' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-yellow-50 text-yellow-600 border-yellow-200'
                        }`}>
                          {rma.financialStatus}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        {rma.financialStatus === "UNSETTLED" ? (
                          <button
                            onClick={() => openSettlementModal(rma)}
                            className="px-4 py-2 bg-slate-900 hover:bg-emerald-600 text-white font-bold rounded-lg shadow-sm text-xs uppercase tracking-wider transition-all active:scale-95"
                          >
                            Process Credit Note &rarr;
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-emerald-600 flex items-center justify-end gap-1.5 pr-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                            Reconciled
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rmas.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">No approved supplier warranty claims awaiting financial settlement.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TAB 3: INBOUND REVENUE STREAMS --- */}
        {activeTab === "REVENUE" && (
          <div className="grid lg:grid-cols-2 gap-8 animate-fade-in-up">
            {/* Workshop Invoiced Jobs */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-emerald-100 bg-emerald-50/30">
                <h3 className="text-lg font-bold text-slate-900">Workshop Billed Job Cards</h3>
                <p className="text-xs text-slate-500 mt-0.5">Automated labor + parts revenue realized upon completion.</p>
              </div>
              <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead className="sticky top-0 bg-white shadow-sm z-10">
                    <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-400 font-black">
                      <th className="px-6 py-4">Job Reference</th>
                      <th className="px-6 py-4">Vehicle Plate</th>
                      <th className="px-6 py-4 text-right">Invoiced Amount</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                    {workshopRevenue.map((job) => (
                      <tr key={job.bookingID} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4 font-mono text-xs text-slate-500">JOB-{job.bookingID}</td>
                        <td className="px-6 py-4 font-bold text-slate-900">{job.vehicleRegNo}</td>
                        <td className="px-6 py-4 text-right font-black text-emerald-600 text-base">+{formatLKR(job.totalPartsCost || 0)}</td>
                      </tr>
                    ))}
                    {workshopRevenue.length === 0 && (
                      <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400">No completed jobs found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Over-The-Counter Retail Log */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-emerald-100 bg-emerald-50/30">
                <h3 className="text-lg font-bold text-slate-900">Over-The-Counter Retail Sales</h3>
                <p className="text-xs text-slate-500 mt-0.5">Direct point-of-sale customer part purchases.</p>
              </div>
              <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead className="sticky top-0 bg-white shadow-sm z-10">
                    <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-400 font-black">
                      <th className="px-6 py-4">Receipt Ref</th>
                      <th className="px-6 py-4">Summary</th>
                      <th className="px-6 py-4 text-right">Cash Received</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                    {retailRevenue.map((txn) => (
                      <tr key={txn.transactionId} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4 font-mono text-xs text-slate-500">TXN-{txn.transactionId}</td>
                        <td className="px-6 py-4 text-xs text-slate-600 truncate max-w-[200px]">{txn.itemsSummary}</td>
                        <td className="px-6 py-4 text-right font-black text-emerald-600 text-base">+{formatLKR(txn.totalRevenue)}</td>
                      </tr>
                    ))}
                    {retailRevenue.length === 0 && (
                      <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400">No retail counter transactions logged.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* --- CREDIT NOTE / OFFSET MODAL --- */}
      {settlementModal.isOpen && settlementModal.rma && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-lg w-full border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-black text-slate-900">Process Credit Settlement</h3>
                <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">
                  RMA-{settlementModal.rma.id} • {settlementModal.rma.supplierName}
                </p>
              </div>
              <button onClick={() => setSettlementModal({ ...settlementModal, isOpen: false })} className="p-2 text-slate-400 hover:text-slate-700 rounded-full">
                ✕
              </button>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl mb-6 flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest">Authorized Refund Value:</span>
              <span className="font-black text-2xl text-emerald-700">{formatLKR(settlementModal.rma.totalValue)}</span>
            </div>

            <div className="space-y-4 mb-6">
              <label className="block text-xs font-black text-slate-600 uppercase tracking-widest">Select Recovery Method</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSettlementModal({ ...settlementModal, method: "OFFSET" })}
                  className={`p-4 rounded-xl border text-left font-bold transition-all ${
                    settlementModal.method === "OFFSET"
                      ? "border-slate-900 bg-slate-900 text-white shadow-md"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="block text-sm">Offset Invoice</span>
                  <span className="text-[10px] font-normal opacity-80 mt-1 block">Deduct directly from active debt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSettlementModal({ ...settlementModal, method: "CASH" })}
                  className={`p-4 rounded-xl border text-left font-bold transition-all ${
                    settlementModal.method === "CASH"
                      ? "border-slate-900 bg-slate-900 text-white shadow-md"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="block text-sm">Direct Deposit</span>
                  <span className="text-[10px] font-normal opacity-80 mt-1 block">Received as bank transfer/cash</span>
                </button>
              </div>

              {settlementModal.method === "OFFSET" && (
                <div className="pt-2">
                  <label className="block text-xs font-black text-slate-600 uppercase tracking-widest mb-2">Target Active Invoice</label>
                  <select
                    value={settlementModal.targetInvoiceId || ""}
                    onChange={(e) => setSettlementModal({ ...settlementModal, targetInvoiceId: parseInt(e.target.value) || null })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="">-- Select Active Bill to Deduct From --</option>
                    {invoices
                      .filter(inv => inv.supplierName.toLowerCase() === settlementModal.rma?.supplierName.toLowerCase() && (inv.totalInvoiceAmount - inv.amountPaid) > 0)
                      .map(inv => {
                        const balance = inv.totalInvoiceAmount - inv.amountPaid;
                        return (
                          <option key={inv.invoiceId} value={inv.invoiceId}>
                            Invoice #{inv.invoiceId} (Due: {inv.dueDate}) — Remaining Balance: {formatLKR(balance)}
                          </option>
                        );
                      })}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSettlementModal({ ...settlementModal, isOpen: false })}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeSettlement}
                className="flex-1 py-3 px-4 rounded-xl font-black text-white bg-slate-900 hover:bg-emerald-600 shadow-md transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                Confirm Settlement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD UTILITY/FUEL INVOICE MODAL --- */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-2xl w-full">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Log External Operational Bill</h2>
                <p className="text-xs font-bold text-slate-500 mt-0.5">For manual fuel refills, utilities, and facility maintenance debts.</p>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 font-bold hover:text-red-500 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Vendor / Utility Name</label>
                <input {...register("supplierName")} type="text" placeholder="e.g., Ceypetco Bulk Fuel" className={`w-full px-4 py-3 rounded-xl border bg-slate-50 outline-none transition-all ${errors.supplierName ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                {errors.supplierName && <p className="mt-1 text-xs font-bold text-red-500">{errors.supplierName.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Category</label>
                <select {...register("supplyCategory")} className="w-full px-4 py-3 rounded-xl border bg-slate-50 outline-none transition-all cursor-pointer border-slate-200 focus:border-blue-500">
                  <option value="FUEL">Fuel Station Stock</option>
                  <option value="EQUIPMENT">Workshop Equipment</option>
                  <option value="MAINTENANCE">Facility Maintenance</option>
                  <option value="SPARE_PARTS" disabled className="text-slate-300">Spare Parts (Auto-Generated via Procurement)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Billed Amount (Rs.)</label>
                <input {...register("totalInvoiceAmount")} type="number" step="0.01" placeholder="0.00" className={`w-full px-4 py-3 rounded-xl border bg-slate-50 outline-none transition-all ${errors.totalInvoiceAmount ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                {errors.totalInvoiceAmount && <p className="mt-1 text-xs font-bold text-red-500">{errors.totalInvoiceAmount.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Payment Deadline</label>
                <input {...register("dueDate")} type="date" className={`w-full px-4 py-3 rounded-xl border bg-slate-50 outline-none transition-all ${errors.dueDate ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                {errors.dueDate && <p className="mt-1 text-xs font-bold text-red-500">{errors.dueDate.message}</p>}
              </div>
              <div className="col-span-2 mt-4 flex justify-between items-center">
                <div className="flex-1">
                  {serverMessage.text && <span className="text-sm font-bold px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700">{serverMessage.text}</span>}
                </div>
                <button type="submit" disabled={isSubmitting} className="px-8 py-4 bg-slate-900 text-white font-black rounded-xl hover:bg-blue-600 transition-all uppercase tracking-widest text-xs">
                  {isSubmitting ? "Registering..." : "Add to Liabilities"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- PAYMENT HISTORY MODAL --- */}
      {historyModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full border border-slate-200">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">Disbursement Ledger</h3>
                <p className="text-xs font-bold text-slate-500 mt-1">{historyModal.supplierName} • {historyModal.supplyCategory.replace('_', ' ')}</p>
              </div>
              <button onClick={() => setHistoryModal(null)} className="text-slate-400 font-bold hover:text-red-500 text-xl">✕</button>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
              {historyModal.paymentHistory.map((record, i) => (
                <div key={i} className="flex justify-between items-center p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                  <div>
                    <span className="block font-black text-emerald-800 text-lg">{formatLKR(record.amountPaid)}</span>
                    <span className="text-[10px] font-bold text-emerald-600/70">{new Date(record.paymentDate).toLocaleString()}</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-white border border-emerald-100 px-3 py-1.5 rounded-lg shadow-sm">
                    By {record.processedBy}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- DELETION CONFIRMATION MODAL --- */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-sm w-full border border-slate-200 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Void Liability?</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">Permanently remove this invoice from the company payables ledger? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteModal({ isOpen: false, invoiceId: null })} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
              <button onClick={executeDelete} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-md">Yes, Void</button>
            </div>
          </div>
        </div>
      )}

      {/* --- NOTIFICATION / ALERT MODAL --- */}
      {alertModal.isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-sm w-full border border-slate-200 text-center">
            <div className={`flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto ${alertModal.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={alertModal.type === 'success' ? "M5 13l4 4L19 7" : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"} />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">{alertModal.title}</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">{alertModal.message}</p>
            <button onClick={() => setAlertModal({ ...alertModal, isOpen: false })} className={`w-full px-4 py-3 rounded-xl font-bold text-white shadow-md active:scale-95 ${alertModal.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'}`}>
              Acknowledge
            </button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in-up { animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }`}} />
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
           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        ) : (
           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        )}
        {trend}
      </div>
    </div>
  );
}