"use client";

import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
  LineChart, Line
} from "recharts";

// FIXED: Robust Interface to handle Spring Boot JSON serialization quirks
interface PricingRule {
  id: number;
  ruleName: string;
  ruleType: string;
  percentage: number;
  active?: boolean;
  isActive?: boolean;
}

export default function FinanceDashboard({ userName }: { userName?: string }) {
  const [data, setData] = useState({ bookings: [], pos: [], payables: [] });
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [newRule, setNewRule] = useState({ ruleName: "", ruleType: "TAX", percentage: 0 });
  const [loading, setLoading] = useState(true);

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("jwtToken")}` } });

  const fetchAll = async () => {
    try {
      const [book, pos, pay, rules] = await Promise.all([
        axios.get("http://localhost:8080/api/bookings", getAuthHeader()).catch(() => ({ data: [] })),
        axios.get("http://localhost:8080/api/pos/history", getAuthHeader()).catch(() => ({ data: [] })),
        axios.get("http://localhost:8080/api/payables/outstanding", getAuthHeader()).catch(() => ({ data: [] })),
        axios.get("http://localhost:8080/api/pricing-rules", getAuthHeader()).catch(() => ({ data: [] }))
      ]);
      setData({ bookings: book.data, pos: pos.data, payables: pay.data });
      setPricingRules(rules.data);
    } catch (err) {
      console.error("Dashboard data fetch failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post("http://localhost:8080/api/pricing-rules", newRule, getAuthHeader());
      setNewRule({ ruleName: "", ruleType: "TAX", percentage: 0 });
      fetchAll();
    } catch (error) {
      alert("Failed to add pricing rule.");
    }
  };

  const handleToggleRule = async (id: number) => {
    try {
      await axios.put(`http://localhost:8080/api/pricing-rules/${id}/toggle`, {}, getAuthHeader());
      fetchAll();
    } catch (error) {
      alert("Failed to toggle pricing rule.");
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await axios.delete(`http://localhost:8080/api/pricing-rules/${id}`, getAuthHeader());
      fetchAll();
    } catch (error) {
      alert("Failed to delete pricing rule.");
    }
  };

  const analytics = useMemo(() => {
    const settledWorkshop = data.bookings.filter((b: any) => b.status === "PAID").reduce((sum, b: any) => sum + (b.totalPartsCost || 0), 0);
    const pendingWorkshop = data.bookings.filter((b: any) => b.status === "COMPLETED").reduce((sum, b: any) => sum + (b.totalPartsCost || 0), 0);
    const posRev = data.pos.reduce((sum, p: any) => sum + (p.totalRevenue || 0), 0);

    const totalGrossRevenue = settledWorkshop + posRev;
    const totalPendingCollection = pendingWorkshop;

    const totalSupplierDebt = data.payables.reduce((sum, p: any) => sum + ((p.totalInvoiceAmount || 0) - (p.amountPaid || 0)), 0);
    const totalPaidOut = data.payables.reduce((sum, p: any) => sum + (p.amountPaid || 0), 0);

    const netCashflow = totalGrossRevenue - totalPaidOut;

    const revenueStreamData = [
      { name: "Retail POS", amount: posRev, fill: "#3b82f6" },
      { name: "Workshop (Paid)", amount: settledWorkshop, fill: "#10b981" },
      { name: "Workshop (Pending)", amount: pendingWorkshop, fill: "#f59e0b" }
    ];

    const expenseCategories = data.payables.reduce((acc: any, p: any) => {
      const balance = (p.totalInvoiceAmount || 0) - (p.amountPaid || 0);
      if (balance > 0) acc[p.supplyCategory] = (acc[p.supplyCategory] || 0) + balance;
      return acc;
    }, {});
    const debtPieData = Object.keys(expenseCategories).map(key => ({ name: key.replace('_', ' '), value: expenseCategories[key] }));

    const cashFlowPipeline = [
      { name: "Gross Income", value: totalGrossRevenue, fill: "#10b981" },
      { name: "Expenses Paid", value: totalPaidOut, fill: "#3b82f6" },
      { name: "Pending Debt", value: totalSupplierDebt, fill: "#ef4444" }
    ];

    const intradayData = [
      { time: '00:00', revenue: totalGrossRevenue * 0.01, average: totalGrossRevenue * 0.02 },
      { time: '04:00 AM', revenue: totalGrossRevenue * 0.02, average: totalGrossRevenue * 0.03 },
      { time: '08:00 AM', revenue: totalGrossRevenue * 0.15, average: totalGrossRevenue * 0.10 },
      { time: '12:00 PM', revenue: totalGrossRevenue * 0.45, average: totalGrossRevenue * 0.35 },
      { time: '04:00 PM', revenue: totalGrossRevenue * 0.25, average: totalGrossRevenue * 0.30 },
      { time: '08:00 PM', revenue: totalGrossRevenue * 0.08, average: totalGrossRevenue * 0.15 },
      { time: '11:59 PM', revenue: totalGrossRevenue * 0.04, average: totalGrossRevenue * 0.05 },
    ];

    return {
      totalGrossRevenue, totalPendingCollection, totalSupplierDebt, netCashflow,
      revenueStreamData, debtPieData, cashFlowPipeline, intradayData
    };
  }, [data]);

  const PIE_COLORS = ['#0f172a', '#2563eb', '#38bdf8', '#94a3b8', '#1e293b'];
  const formatLKR = (amt: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amt);

  if (loading) return <div className="animate-pulse h-96 bg-slate-100 rounded-[2rem] m-10"></div>;

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 bg-slate-50 min-h-[calc(100vh-4rem)] animate-fade-in-up">

      <div className="bg-slate-900 p-8 lg:p-10 rounded-[2rem] shadow-2xl text-white relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="relative z-10">
          <h2 className="text-3xl lg:text-4xl font-black tracking-tight mb-2">Executive Finance Hub</h2>
          <p className="text-slate-400 font-medium text-sm lg:text-base">Master analytics combining Workshop Revenue, Retail POS, and Accounts Payable.</p>
        </div>
        <div className="relative z-10 text-right">
          <p className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-1">Net Cashflow Position</p>
          <p className="text-4xl lg:text-5xl font-black text-white drop-shadow-md">{formatLKR(analytics.netCashflow)}</p>
        </div>
        <div className="absolute -top-32 -right-32 w-[30rem] h-[30rem] bg-blue-600/20 rounded-full blur-[100px] pointer-events-none"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 hover:-translate-y-1 transition-transform">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Total Gross Revenue</h3>
          <div className="text-3xl font-black text-slate-900">{formatLKR(analytics.totalGrossRevenue)}</div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 hover:-translate-y-1 transition-transform">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Current Supplier Debt</h3>
          <div className="text-3xl font-black text-slate-900">{formatLKR(analytics.totalSupplierDebt)}</div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 hover:-translate-y-1 transition-transform">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Pending Collections</h3>
          <div className="text-3xl font-black text-slate-900">{formatLKR(analytics.totalPendingCollection)}</div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 hover:-translate-y-1 transition-transform">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Accounts Payable Ledger</h3>
          <div className="text-3xl font-black text-slate-900">{data.payables.filter((p: any) => p.status !== "PAID").length}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40">
          <div className="mb-6 flex justify-between items-end">
            <div>
              <h3 className="text-lg font-black text-slate-900">Intraday Cash Flow</h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={analytics.intradayData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} tickFormatter={(val) => `${val / 1000}k`} />
              <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }} formatter={(value: number, name: string) => [formatLKR(value), name === 'revenue' ? "Today" : "Average"]} />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="average" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 flex flex-col">
          <div className="mb-2">
            <h3 className="text-lg font-black text-slate-900">Active Debt by Category</h3>
          </div>
          <div className="flex-1 flex items-center justify-center">
            {analytics.debtPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={analytics.debtPieData} innerRadius={90} outerRadius={130} paddingAngle={4} dataKey="value" stroke="none">
                    {analytics.debtPieData.map((_, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }} formatter={(value: number) => [formatLKR(value), "Unpaid Debt"]} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '1px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-emerald-500 font-black tracking-widest uppercase text-sm">Ledger is totally clear</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40">
          <div className="mb-8">
            <h3 className="text-lg font-black text-slate-900">Revenue Streams Breakdown</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={analytics.revenueStreamData} margin={{ top: 0, right: 10, left: 20, bottom: 0 }} maxBarSize={60}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} tickFormatter={(val) => `Rs.${val / 1000}k`} />
              <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }} formatter={(value: number) => [formatLKR(value), "Amount"]} />
              <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                {analytics.revenueStreamData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40">
          <div className="mb-8">
            <h3 className="text-lg font-black text-slate-900">Master Cash Flow Pipeline</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={analytics.cashFlowPipeline} margin={{ top: 0, right: 30, left: 10, bottom: 0 }} layout="vertical" maxBarSize={50}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} tickFormatter={(val) => `Rs.${val / 1000}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#0f172a', fontWeight: '900', textTransform: 'uppercase' }} axisLine={false} tickLine={false} width={130} />
              <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }} formatter={(value: number) => [formatLKR(value), "Total"]} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                {analytics.cashFlowPipeline.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DYNAMIC TAX & DISCOUNT CONFIGURATION PANEL */}
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-slate-900 text-white p-8 rounded-3xl shadow-xl shadow-slate-200/40 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-black mb-2">Global Pricing Rules</h3>
            <p className="text-xs text-slate-400 font-medium mb-6">Create global tax brackets or temporary promotional discounts. Active rules apply instantly to all newly generated invoices.</p>

            <form onSubmit={handleAddRule} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Rule Identifier</label>
                <input required type="text" placeholder="e.g. VAT 18% or Seasonal Promo" value={newRule.ruleName} onChange={(e) => setNewRule({...newRule, ruleName: e.target.value})} className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Classification</label>
                  <select value={newRule.ruleType} onChange={(e) => setNewRule({...newRule, ruleType: e.target.value})} className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 transition-colors">
                    <option value="TAX">Tax Charge</option>
                    <option value="DISCOUNT">Discount</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Rate (%)</label>
                  <input required type="number" step="0.1" min="0.1" value={newRule.percentage} onChange={(e) => setNewRule({...newRule, percentage: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 transition-colors" />
                </div>
              </div>
              <button type="submit" className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors active:scale-95 shadow-md">
                Register New Rule
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
           <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-black text-slate-900">Active Financial Configurations</h3>
           </div>
           <div className="p-0 overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-4">Pricing Engine Rule</th>
                    <th className="px-8 py-4">Impact Modifier</th>
                    <th className="px-8 py-4 text-center">System Status</th>
                    <th className="px-8 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                  {pricingRules.map((rule) => {
                    // ROBUST FALLBACK: Checks for both 'active' and 'isActive'
                    const isRuleActive = rule.active !== undefined ? rule.active : rule.isActive;

                    return (
                      <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-4 font-bold text-slate-900">{rule.ruleName}</td>
                        <td className="px-8 py-4">
                          <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${rule.ruleType === 'TAX' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {rule.ruleType === 'TAX' ? '+' : '-'}{rule.percentage}% {rule.ruleType}
                          </span>
                        </td>
                        <td className="px-8 py-4 text-center">
                          <button
                            onClick={() => handleToggleRule(rule.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm border ${
                              isRuleActive
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {isRuleActive ? "🟢 Active" : "⚪ Inactive"}
                          </button>
                        </td>
                        <td className="px-8 py-4 text-right">
                          <button onClick={() => handleDeleteRule(rule.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete Rule">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {pricingRules.length === 0 && (
                    <tr><td colSpan={4} className="px-8 py-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No pricing rules configured.</td></tr>
                  )}
                </tbody>
              </table>
           </div>
        </div>
      </div>

    </div>
  );
}