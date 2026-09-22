"use client";

import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";

interface SupplyRequest {
  id: number;
  partName: string;
  quantityRequested: number;
  totalExpectedValue: number;
  status: string;
  orderDate: string;
}

interface RmaRefund {
  id: number;
  partName: string;
  quantity: number;
  status: string;
  dateLogged: string;
}

interface AccountsPayable {
  invoiceId: number;
  supplierName: string;
  totalInvoiceAmount: number;
  amountPaid: number;
  status: string;
  dueDate: string;
}

export default function SupplierDashboard() {
  const { user } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [orders, setOrders] = useState<SupplyRequest[]>([]);
  const [rmas, setRmas] = useState<RmaRefund[]>([]);
  const [invoices, setInvoices] = useState<AccountsPayable[]>([]);

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  useEffect(() => {
    setIsMounted(true);
    if (!user) return;

    const fetchData = async () => {
      try {
        const [supplyRes, rmaRes, payableRes] = await Promise.all([
          axios.get("http://localhost:8080/api/supply", getAuthHeader()).catch(() => ({ data: [] })),
          axios.get("http://localhost:8080/api/rma", getAuthHeader()).catch(() => ({ data: [] })),
          axios.get("http://localhost:8080/api/payables/outstanding", getAuthHeader()).catch(() => ({ data: [] }))
        ]);

        const myName = user.fullName || user.username;

        setOrders(supplyRes.data.sort((a: SupplyRequest, b: SupplyRequest) => b.id - a.id));
        setRmas(rmaRes.data.filter((r: RmaRefund) => r.supplierName === myName).sort((a: RmaRefund, b: RmaRefund) => b.id - a.id));
        setInvoices(payableRes.data.filter((i: AccountsPayable) => i.supplierName === myName));
      } catch (error) {
        console.error("Failed to load supplier dashboard data", error);
      }
    };

    fetchData();
  }, [user]);

  const { pendingOrders, pendingRmas, totalOutstanding } = useMemo(() => {
    const pendingOrdersCount = orders.filter(o => o.status === "PENDING_DISPATCH").length;
    const pendingRmasCount = rmas.filter(r => r.status === "PENDING").length;

    const outstandingCash = invoices.reduce((sum, inv) => {
      const balance = inv.totalInvoiceAmount - inv.amountPaid;
      return sum + (balance > 0 ? balance : 0);
    }, 0);

    return { pendingOrders: pendingOrdersCount, pendingRmas: pendingRmasCount, totalOutstanding: outstandingCash };
  }, [orders, rmas, invoices]);

  const formatLKR = (amount: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);

  if (!isMounted) return null;

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* --- HEADER --- */}
      <div>
        <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Supplier Partner Portal</h1>
        <p className="text-slate-500 font-medium mt-2">Welcome back, {user?.fullName || user?.username}. Here is your account overview with Lanka Auto Care.</p>
      </div>

      {/* --- KPI CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Pending Orders</h3>
            <div className="text-3xl font-black text-slate-900">{pendingOrders}</div>
            <p className="text-xs font-bold text-blue-600 mt-1">Awaiting your dispatch</p>
          </div>
          <Link href="/deliveries" className="mt-4 text-xs font-black uppercase tracking-widest text-slate-900 hover:text-blue-600 flex items-center gap-1">
            View Deliveries <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Warranty Claims</h3>
            <div className={`text-3xl font-black ${pendingRmas > 0 ? 'text-orange-600' : 'text-slate-900'}`}>{pendingRmas}</div>
            <p className={`text-xs font-bold mt-1 ${pendingRmas > 0 ? 'text-orange-600 animate-pulse' : 'text-emerald-600'}`}>
              {pendingRmas > 0 ? "Action required on returns" : "All RMAs processed"}
            </p>
          </div>
          <Link href="/rma" className="mt-4 text-xs font-black uppercase tracking-widest text-slate-900 hover:text-orange-600 flex items-center gap-1">
            Review RMAs <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Unpaid Receivables</h3>
            <div className="text-3xl font-black">{formatLKR(totalOutstanding)}</div>
            <p className="text-xs font-bold text-emerald-400 mt-1">Pending payment from Lanka Auto Care</p>
          </div>
        </div>
      </div>

      {/* --- RECENT ACTIVITY LISTS --- */}
      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900">Recent Purchase Orders</h3>
          </div>
          <div className="p-0">
            <div className="divide-y divide-slate-50">
              {orders.slice(0, 5).map(order => (
                <div key={order.id} className="p-5 flex justify-between items-center hover:bg-slate-50 transition-colors">
                  <div>
                    <div className="font-bold text-slate-900">{order.partName} <span className="text-xs text-slate-500 font-normal">x{order.quantityRequested}</span></div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">PO-{order.id.toString().padStart(4, '0')} • {new Date(order.orderDate).toLocaleDateString()}</div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                    order.status === 'PENDING_DISPATCH' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {order.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
              {orders.length === 0 && <div className="p-8 text-center text-slate-500 text-sm font-medium">No purchase orders found.</div>}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900">Active RMA Requests</h3>
          </div>
          <div className="p-0">
            <div className="divide-y divide-slate-50">
              {rmas.slice(0, 5).map(rma => (
                <div key={rma.id} className="p-5 flex justify-between items-center hover:bg-slate-50 transition-colors">
                  <div>
                    <div className="font-bold text-slate-900">{rma.partName} <span className="text-xs text-slate-500 font-normal">x{rma.quantity}</span></div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">RMA-{rma.id.toString().padStart(4, '0')} • {new Date(rma.dateLogged).toLocaleDateString()}</div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                    rma.status === 'PENDING' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}>
                    {rma.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
              {rmas.length === 0 && <div className="p-8 text-center text-slate-500 text-sm font-medium">No active RMA requests.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}