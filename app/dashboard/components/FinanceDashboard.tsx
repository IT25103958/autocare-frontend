"use client";

export default function FinanceDashboard({ userName }: { userName?: string }) {
  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Finance Operations</h1>
          <p className="text-sm font-bold text-slate-500 mt-1">Welcome, {userName}. Here is today's financial summary.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-5 py-2.5 bg-blue-600 text-white text-sm font-black uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all">
            Process Payroll
          </button>
        </div>
      </div>

      {/* FINANCE KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Pending Payables</h3>
          <div className="text-3xl font-black text-slate-900">Rs. 1,250,000</div>
          <p className="text-sm font-bold text-blue-600 mt-2">12 Active Invoices</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Daily POS Revenue</h3>
          <div className="text-3xl font-black text-slate-900">Rs. 85,500</div>
          <p className="text-sm font-bold text-emerald-600 mt-2">Cash securely logged</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Upcoming Payroll</h3>
          <div className="text-3xl font-black text-slate-900">Rs. 890,000</div>
          <p className="text-sm font-bold text-amber-600 mt-2">Due in 4 days</p>
        </div>
      </div>

      {/* QUICK ACTIONS & ALERTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl">
          <h2 className="text-xl font-black mb-4">Financial Alerts</h2>
          <ul className="space-y-4">
            <li className="flex items-start gap-3 bg-slate-800 p-4 rounded-xl">
              <span className="w-2 h-2 mt-1.5 rounded-full bg-red-500 shrink-0"></span>
              <div>
                <p className="text-sm font-bold text-slate-100">AutoParts Hub Invoice Overdue</p>
                <p className="text-xs font-medium text-slate-400 mt-1">Rs. 45,000 was due yesterday. Please clear via Payables.</p>
              </div>
            </li>
            <li className="flex items-start gap-3 bg-slate-800 p-4 rounded-xl">
              <span className="w-2 h-2 mt-1.5 rounded-full bg-amber-500 shrink-0"></span>
              <div>
                <p className="text-sm font-bold text-slate-100">Pending Salary Approvals</p>
                <p className="text-xs font-medium text-slate-400 mt-1">3 mechanics are requesting overtime approval for this week.</p>
              </div>
            </li>
          </ul>
        </div>
      </div>

    </div>
  );
}