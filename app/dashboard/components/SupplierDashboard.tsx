"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import api from "../../../utils/axiosInstance";
import { getErrorMessage } from "../../../utils/apiError";

interface SupplierProfile {
  id: number;
  supplierCode: string;
  companyName: string;
  categories: string[];
  status: string;
  paymentTermsDays: number;
}

interface Summary {
  invoiced: number;
  paid: number;
  outstanding: number;
  overdue: number;
  overdueInvoices: number;
  openOrders: number;
  pendingRefundCredit: number;
}

interface Invoice {
  invoiceId: number;
  supplyCategory: string;
  totalInvoiceAmount: number;
  amountPaid: number;
  dueDate: string;
}

interface FuelOrder {
  id: number;
  fuelType: string;
  litersOrdered: number;
  totalExpectedValue: number;
  status: string;
}

interface PartOrder {
  id: number;
  partName: string;
  quantityRequested: number;
  totalExpectedValue: number;
  status: string;
  orderDate: string;
}

interface ReturnRequest {
  id: number;
  partName: string;
  quantity: number;
  status: string;
  dateLogged: string;
}

// One call returns the supplier's own company, balance, bills, orders and
// returns — scoped on the server to the company this login belongs to.
interface Statement {
  supplier: SupplierProfile;
  summary: Summary;
  invoices: Invoice[];
  fuelOrders: FuelOrder[];
  partOrders: PartOrder[];
  returns: ReturnRequest[];
}

const formatLKR = (amount: number) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(amount || 0);

export default function SupplierDashboard() {
  const { user } = useAuth();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get<Statement>("/suppliers/me/statement");
      setStatement(res.data);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load your account."));
    }
  }, [user]);

  useEffect(() => {
    // Started from a callback so the state updates aren't made inside the effect body.
    Promise.resolve().then(fetchData);
  }, [fetchData]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-8 bg-white rounded-3xl border border-amber-200 shadow-sm text-center">
        <h1 className="text-2xl font-black text-slate-900 mb-2">Supplier Partner Portal</h1>
        <p className="text-sm font-bold text-amber-700">{error}</p>
      </div>
    );
  }
  if (!statement) return <div className="p-12 text-center text-slate-400 font-bold">Loading your account...</div>;

  const { supplier, summary } = statement;
  const suppliesFuel = supplier.categories.includes("FUEL");
  const suppliesParts = supplier.categories.includes("SPARE_PARTS");
  const pendingFuel = statement.fuelOrders.filter((o) => o.status === "ORDERED").length;
  const pendingParts = statement.partOrders.filter((o) => o.status === "PENDING_DISPATCH").length;
  const pendingReturns = statement.returns.filter((r) => r.status === "PENDING").length;
  const today = new Date().toISOString().slice(0, 10);
  const openInvoices = statement.invoices.filter((i) => i.totalInvoiceAmount - i.amountPaid > 0.005);

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div>
        <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Supplier Partner Portal</h1>
        <p className="text-slate-500 font-medium mt-2">
          {supplier.companyName} <span className="font-mono text-xs">({supplier.supplierCode})</span> · signed in as {user?.fullName || user?.username}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {supplier.categories.map((c) => (
            <span key={c} className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 border border-slate-200">
              {c === "FUEL" ? "Fuel supplier" : "Spare parts supplier"}
            </span>
          ))}
          <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 border border-slate-200">
            {supplier.paymentTermsDays}-day payment terms
          </span>
          {supplier.status !== "ACTIVE" && (
            <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-red-50 text-red-700 border border-red-200">
              Account suspended — no new orders
            </span>
          )}
        </div>
      </div>

      {/* KPI CARDS — only the flows this company supplies */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {suppliesFuel && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Fuel Orders to Dispatch</h3>
              <div className="text-3xl font-black text-slate-900">{pendingFuel}</div>
            </div>
            <Link href="/fuel-deliveries" className="mt-4 text-xs font-black uppercase tracking-widest text-slate-900 hover:text-blue-600">Open fuel orders →</Link>
          </div>
        )}
        {suppliesParts && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Parts Orders to Dispatch</h3>
              <div className="text-3xl font-black text-slate-900">{pendingParts}</div>
              {pendingReturns > 0 && <p className="text-xs font-bold text-orange-600 mt-1">{pendingReturns} warranty return{pendingReturns > 1 ? "s" : ""} need a decision</p>}
            </div>
            <div className="mt-4 flex gap-4">
              <Link href="/deliveries" className="text-xs font-black uppercase tracking-widest text-slate-900 hover:text-blue-600">Deliveries →</Link>
              <Link href="/rma" className="text-xs font-black uppercase tracking-widest text-slate-900 hover:text-orange-600">Returns →</Link>
            </div>
          </div>
        )}
        <div className="p-6 rounded-3xl border border-slate-200 shadow-sm bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Balance Due to You</h3>
          <div className="text-3xl font-black">{formatLKR(summary.outstanding)}</div>
          {summary.overdue > 0 && <p className="text-xs font-bold text-red-300 mt-1">{formatLKR(summary.overdue)} overdue ({summary.overdueInvoices} bill{summary.overdueInvoices > 1 ? "s" : ""})</p>}
          {summary.pendingRefundCredit > 0 && <p className="text-xs font-bold text-amber-300 mt-1">Less {formatLKR(summary.pendingRefundCredit)} refund credit owed to us</p>}
          <p className="text-[11px] font-medium text-slate-400 mt-3">Invoiced {formatLKR(summary.invoiced)} · Paid {formatLKR(summary.paid)}</p>
        </div>
      </div>

      {supplier.categories.length === 0 && (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-sm font-bold text-amber-800">
          Your company isn&apos;t approved for any supply category yet. Lanka Auto Care&apos;s finance team will set this up.
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        {/* ACCOUNT STATEMENT */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-lg font-bold text-slate-900">Unpaid Bills</h3>
            <p className="text-xs font-medium text-slate-500">What Lanka Auto Care still owes you, by bill.</p>
          </div>
          <div className="divide-y divide-slate-50">
            {openInvoices.slice(0, 8).map((inv) => {
              const balance = inv.totalInvoiceAmount - inv.amountPaid;
              const overdue = inv.dueDate < today;
              return (
                <div key={inv.invoiceId} className="p-5 flex justify-between items-center">
                  <div>
                    <div className="font-bold text-slate-900">Bill #{inv.invoiceId} <span className="text-xs font-normal text-slate-500">{inv.supplyCategory.replace("_", " ")}</span></div>
                    <div className={`text-[10px] font-bold mt-0.5 ${overdue ? "text-red-600" : "text-slate-400"}`}>Due {inv.dueDate}{overdue && " · overdue"}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-slate-900">{formatLKR(balance)}</div>
                    {inv.amountPaid > 0 && <div className="text-[10px] font-bold text-emerald-600">{formatLKR(inv.amountPaid)} paid</div>}
                  </div>
                </div>
              );
            })}
            {openInvoices.length === 0 && <div className="p-8 text-center text-slate-500 text-sm font-medium">No unpaid bills.</div>}
          </div>
        </div>

        {/* RECENT ORDERS */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-lg font-bold text-slate-900">Recent Orders</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {suppliesFuel && statement.fuelOrders.slice(0, 5).map((o) => (
              <div key={`f${o.id}`} className="p-5 flex justify-between items-center">
                <div>
                  <div className="font-bold text-slate-900">{o.fuelType} <span className="text-xs text-slate-500 font-normal">x{o.litersOrdered}L</span></div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">FD-{o.id.toString().padStart(5, "0")} · {formatLKR(o.totalExpectedValue)}</div>
                </div>
                <span className="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border bg-slate-50 text-slate-700 border-slate-200">{o.status}</span>
              </div>
            ))}
            {suppliesParts && statement.partOrders.slice(0, 5).map((o) => (
              <div key={`p${o.id}`} className="p-5 flex justify-between items-center">
                <div>
                  <div className="font-bold text-slate-900">{o.partName} <span className="text-xs text-slate-500 font-normal">x{o.quantityRequested}</span></div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">PO-{o.id.toString().padStart(4, "0")} · {new Date(o.orderDate).toLocaleDateString()}</div>
                </div>
                <span className="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border bg-slate-50 text-slate-700 border-slate-200">{o.status.replace("_", " ")}</span>
              </div>
            ))}
            {statement.fuelOrders.length + statement.partOrders.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm font-medium">No orders yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
