"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';

// --- MOCK DATA FOR UI VISUALIZATION ---
const revenueData = [
  { name: 'Mon', POS: 45000, Workshop: 120000 },
  { name: 'Tue', POS: 52000, Workshop: 95000 },
  { name: 'Wed', POS: 38000, Workshop: 140000 },
  { name: 'Thu', POS: 65000, Workshop: 110000 },
  { name: 'Fri', POS: 85000, Workshop: 160000 },
  { name: 'Sat', POS: 110000, Workshop: 210000 },
  { name: 'Sun', POS: 95000, Workshop: 180000 },
];

const fuelSalesData = [
  { time: '08:00', Petrol: 400, Diesel: 250 },
  { time: '12:00', Petrol: 800, Diesel: 600 },
  { time: '16:00', Petrol: 1200, Diesel: 950 },
  { time: '20:00', Petrol: 1500, Diesel: 1100 },
];

export default function ExecutiveDashboard({ userName }: { userName?: string }) {
  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Executive Overview</h1>
          <p className="text-sm font-bold text-slate-500 mt-1">Welcome back, {userName || "Executive"}. Here is your enterprise summary.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export PDF
          </button>
        </div>
      </div>

      {/* TOP LEVEL KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Daily Revenue" value="Rs. 425,000" trend="+14.5%" trendUp={true} icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <KpiCard title="Active Workshop Jobs" value="24 Vehicles" trend="4 Pending Parts" trendUp={false} icon="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <KpiCard title="Supplier Debt Payable" value="Rs. 1.2M" trend="Rs. 450k due this week" trendUp={false} icon="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
        <KpiCard title="Total Fuel Dispensed" value="2,600 L" trend="Steady flow" trendUp={true} icon="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </div>

      {/* CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* MAIN REVENUE CHART (Spans 2 columns) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="mb-6">
            <h3 className="text-lg font-black text-slate-900">Weekly Revenue Streams</h3>
            <p className="text-xs font-bold text-slate-500">Retail POS vs Workshop Services</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorWorkshop" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPOS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 900, color: '#0f172a' }}
                />
                <Area type="monotone" dataKey="Workshop" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorWorkshop)" />
                <Area type="monotone" dataKey="POS" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorPOS)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FUEL VOLUME CHART (Spans 1 column) */}
        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col">
          <div className="mb-6">
            <h3 className="text-lg font-black text-white">Fuel Dispensation</h3>
            <p className="text-xs font-bold text-slate-400">Cumulative Volume (Liters)</p>
          </div>
          <div className="h-72 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fuelSalesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.5} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#94a3b8' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #334155' }}
                  itemStyle={{ fontWeight: 700 }}
                />
                <Line type="monotone" dataKey="Petrol" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="Diesel" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}

// Sub-component for clean KPI Cards
function KpiCard({ title, value, trend, trendUp, icon }: { title: string, value: string, trend: string, trendUp: boolean, icon: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-blue-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} /></svg>
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md ${trendUp ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
          {trendUp ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>}
          {trend}
        </div>
      </div>
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
        <div className="text-2xl font-black text-slate-900 mt-1 tracking-tight">{value}</div>
      </div>
    </div>
  );
}