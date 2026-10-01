"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, Legend,
} from "recharts";
import api from "../../../utils/axiosInstance";
import { getErrorMessage } from "../../../utils/apiError";
import { downloadFile, isoDate } from "../../billing/_components/billing";
import FinanceAlerts from "./FinanceAlerts";

// Everything on this page comes from /analytics/executive-summary, which is
// computed from live records (payments, counter sales, fuel sales, job cards,
// supplier bills) each time it is requested.
interface DayPoint { date: string; label: string; workshop: number; pos: number; fuel: number; total: number }

interface Summary {
  generatedAt: string;
  revenue: { today: number; yesterday: number; workshop: number; pos: number; fuel: number; weekTotal: number };
  week: DayPoint[];
  workshop: { active: number; inProgress: number; awaitingConfirmation: number; awaitingPayment: number; toHandOver: number };
  suppliers: { owed: number; dueThisWeek: number; overdue: number; openBills: number };
  customers: { owed: number; openInvoices: number };
  fuel: { litersToday: number; litersYesterday: number; lowTanks: string[]; types: string[]; cumulative: Record<string, number | string>[] };
  lowStockParts: number;
}

const FUEL_COLOURS = ["#f59e0b", "#3b82f6", "#10b981", "#f43f5e", "#a78bfa"];

const lkr = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Rs. 1.2M / Rs. 450K for the headline cards; the exact figure is in the tooltip.
const compact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `Rs. ${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 100_000) return `Rs. ${(n / 1000).toFixed(0)}K`;
  return `Rs. ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const liters = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} L`;

// "+14.5% vs yesterday", or a plain sentence when there is nothing to compare with.
function change(today: number, yesterday: number, unit: string) {
  if (yesterday <= 0) return { text: today > 0 ? `No ${unit} yesterday` : `No ${unit} yet today`, good: today > 0 };
  const pct = ((today - yesterday) / yesterday) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs yesterday`, good: pct >= 0 };
}

export default function ExecutiveDashboard({ userName }: { userName?: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get<Summary>("/analytics/executive-summary")
      .then(res => { setData(res.data); setError(""); })
      .catch(err => setError(getErrorMessage(err, "Couldn't load the dashboard figures.")))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const refresh = () => {
    setLoading(true);
    setReloadKey(k => k + 1);
  };

  // This month's Financial Summary report, as PDF.
  const exportPdf = async () => {
    setExporting(true);
    try {
      const now = new Date();
      const from = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
      const to = isoDate(now);
      await downloadFile("/finance/reports/summary", `Financial-Summary_${from}_to_${to}.pdf`, { from, to, format: "pdf" });
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't export the report."));
    } finally {
      setExporting(false);
    }
  };

  const revenueChange = data ? change(data.revenue.today, data.revenue.yesterday, "sales") : null;
  const fuelChange = data ? change(data.fuel.litersToday, data.fuel.litersYesterday, "fuel sold") : null;
  const weekHasSales = !!data && data.revenue.weekTotal > 0;
  const fuelHasSales = !!data && data.fuel.types.length > 0;

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Executive Overview</h1>
          <p className="text-sm font-bold text-slate-500 mt-1">
            Welcome back, {userName || "Executive"}. Live figures from the books
            {data && <> · updated {new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>}.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={refresh} disabled={loading}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 transition-all disabled:opacity-60">
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button onClick={exportPdf} disabled={exporting}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-60">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            {exporting ? "Preparing..." : "Export PDF"}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="px-4 py-3 rounded-xl text-sm font-bold border bg-red-50 text-red-700 border-red-200 flex items-center justify-between gap-4">
          {error}
          <button onClick={refresh} className="text-xs font-black uppercase tracking-widest text-red-700 hover:text-red-900 whitespace-nowrap">Try again</button>
        </div>
      )}

      {!data && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Loading figures">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />)}
        </div>
      )}

      {data && (
        <>
          {/* TOP LEVEL KPI CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Revenue Today" value={compact(data.revenue.today)} exact={lkr(data.revenue.today)}
              trend={revenueChange!.text} trendUp={revenueChange!.good}
              detail={`Workshop ${compact(data.revenue.workshop)} · Counter ${compact(data.revenue.pos)} · Fuel ${compact(data.revenue.fuel)}`}
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <KpiCard title="Active Workshop Jobs" value={`${data.workshop.active} Vehicle${data.workshop.active === 1 ? "" : "s"}`}
              trend={data.workshop.awaitingConfirmation > 0 ? `${data.workshop.awaitingConfirmation} to confirm` : "Nothing waiting"} trendUp={data.workshop.awaitingConfirmation === 0}
              detail={`${data.workshop.inProgress} being worked on · ${data.workshop.awaitingPayment} awaiting payment · ${data.workshop.toHandOver} to hand over`}
              href="/bookings"
              icon="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <KpiCard title="Supplier Debt Payable" value={compact(data.suppliers.owed)} exact={lkr(data.suppliers.owed)}
              trend={data.suppliers.overdue > 0 ? `${compact(data.suppliers.overdue)} overdue` : data.suppliers.dueThisWeek > 0 ? `${compact(data.suppliers.dueThisWeek)} due this week` : "Nothing due this week"}
              trendUp={data.suppliers.overdue === 0 && data.suppliers.dueThisWeek === 0}
              detail={`${data.suppliers.openBills} open bill${data.suppliers.openBills === 1 ? "" : "s"} · ${compact(data.suppliers.dueThisWeek)} due within 7 days`}
              href="/payables"
              icon="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
            <KpiCard title="Fuel Dispensed Today" value={liters(data.fuel.litersToday)}
              trend={data.fuel.lowTanks.length > 0 ? `${data.fuel.lowTanks.length} tank${data.fuel.lowTanks.length === 1 ? "" : "s"} low` : fuelChange!.text}
              trendUp={data.fuel.lowTanks.length === 0 && fuelChange!.good}
              detail={data.fuel.lowTanks.length > 0 ? `Reorder: ${data.fuel.lowTanks.join(", ")}` : `Yesterday: ${liters(data.fuel.litersYesterday)}`}
              href="/tanks"
              icon="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </div>

          {/* SECOND ROW: what is owed and what is running short */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MiniStat label="Owed by customers" value={lkr(data.customers.owed)} sub={`${data.customers.openInvoices} unpaid invoice${data.customers.openInvoices === 1 ? "" : "s"}`} href="/billing" />
            <MiniStat label="Collected in the last 7 days" value={lkr(data.revenue.weekTotal)} sub="Workshop, counter and fuel" href="/reports" />
            <MiniStat label="Parts low on stock" value={String(data.lowStockParts)} sub={data.lowStockParts > 0 ? "At or below their minimum level" : "All parts above minimum"} href="/parts" />
          </div>

          {/* CHARTS GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* MAIN REVENUE CHART (Spans 2 columns) */}
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="mb-6">
                <h3 className="text-lg font-black text-slate-900">Revenue — Last 7 Days</h3>
                <p className="text-xs font-bold text-slate-500">Money received from workshop bills, counter sales and fuel</p>
              </div>
              <div className="h-72">
                {weekHasSales ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.week} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorWorkshop" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorPOS" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorFuel" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: "#64748b" }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} width={48} tick={{ fontSize: 12, fontWeight: 700, fill: "#64748b" }}
                        tickFormatter={v => (Number(v) >= 1000 ? `${Number(v) / 1000}k` : String(v))} />
                      <Tooltip
                        contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                        labelStyle={{ fontWeight: 900, color: "#0f172a" }}
                        formatter={(value, name) => [lkr(Number(value)), name]}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                      <Area type="monotone" name="Workshop" dataKey="workshop" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorWorkshop)" />
                      <Area type="monotone" name="Counter (POS)" dataKey="pos" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorPOS)" />
                      <Area type="monotone" name="Fuel" dataKey="fuel" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorFuel)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <EmptyChart text="No money was received in the last 7 days." />}
              </div>
            </div>

            {/* FUEL VOLUME CHART (Spans 1 column) */}
            <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col">
              <div className="mb-6">
                <h3 className="text-lg font-black text-white">Fuel Dispensed Today</h3>
                <p className="text-xs font-bold text-slate-400">Running total by fuel type (litres)</p>
              </div>
              <div className="h-72 flex-1">
                {fuelHasSales ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.fuel.cumulative} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.5} />
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: "#94a3b8" }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: "#94a3b8" }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0f172a", borderRadius: "12px", border: "1px solid #334155" }}
                        labelStyle={{ color: "#e2e8f0", fontWeight: 900 }}
                        itemStyle={{ fontWeight: 700 }}
                        formatter={(value, name) => [liters(Number(value)), name]}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                      {data.fuel.types.map((type, i) => (
                        <Line key={type} type="monotone" dataKey={type} stroke={FUEL_COLOURS[i % FUEL_COLOURS.length]} strokeWidth={3} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : <EmptyChart dark text="No fuel has been sold today." />}
              </div>
            </div>

          </div>

          <FinanceAlerts refreshKey={data.generatedAt} />
        </>
      )}
    </div>
  );
}

function EmptyChart({ text, dark = false }: { text: string; dark?: boolean }) {
  return <div className={`h-full flex items-center justify-center text-center text-sm font-bold ${dark ? "text-slate-500" : "text-slate-400"}`}>{text}</div>;
}

function MiniStat({ label, value, sub, href }: { label: string; value: string; sub: string; href: string }) {
  return (
    <Link href={href} className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</h3>
      <div className="text-xl font-black text-slate-900 mt-1 tabular-nums">{value}</div>
      <p className="text-xs font-bold text-slate-500 mt-1 group-hover:text-blue-700">{sub} →</p>
    </Link>
  );
}

// Sub-component for clean KPI Cards
function KpiCard({ title, value, exact, trend, trendUp, detail, icon, href }: {
  title: string; value: string; exact?: string; trend: string; trendUp: boolean; detail: string; icon: string; href?: string;
}) {
  const body = (
    <>
      <div className="flex justify-between items-start gap-2 mb-4">
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-blue-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} /></svg>
        </div>
        <div className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md text-right ${trendUp ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"}`}>
          {trend}
        </div>
      </div>
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
        <div className="text-2xl font-black text-slate-900 mt-1 tracking-tight tabular-nums" title={exact}>{value}</div>
        <p className="text-[11px] font-semibold text-slate-500 mt-1.5 leading-snug">{detail}</p>
      </div>
    </>
  );
  const className = "bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between";
  return href
    ? <Link href={href} className={`${className} hover:border-blue-300 hover:shadow-md transition-all`}>{body}</Link>
    : <div className={className}>{body}</div>;
}
