"use client";

export default function WorkshopDashboard({ userName }: { userName?: string }) {
  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Workshop Operations</h1>
          <p className="text-sm font-bold text-slate-500 mt-1">Welcome, {userName}. Here is the live service floor status.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-5 py-2.5 bg-blue-600 text-white text-sm font-black uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all">
            New Job Card
          </button>
        </div>
      </div>

      {/* WORKSHOP KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Active Service Bays</h3>
          <div className="text-3xl font-black text-slate-900">8 / 10</div>
          <p className="text-sm font-bold text-blue-600 mt-2">Bays currently occupied</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Pending Bookings</h3>
          <div className="text-3xl font-black text-slate-900">14 Vehicles</div>
          <p className="text-sm font-bold text-amber-600 mt-2">Scheduled for today</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Available Mechanics</h3>
          <div className="text-3xl font-black text-slate-900">6 Staff</div>
          <p className="text-sm font-bold text-emerald-600 mt-2">Clocked in on roster</p>
        </div>
      </div>

      {/* JOB CARD TRACKER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl">
          <h2 className="text-xl font-black mb-4">Urgent Floor Alerts</h2>
          <ul className="space-y-4">
            <li className="flex items-start gap-3 bg-slate-800 p-4 rounded-xl">
              <span className="w-2 h-2 mt-1.5 rounded-full bg-red-500 shrink-0"></span>
              <div>
                <p className="text-sm font-bold text-slate-100">Job Card #4092 - Parts Delay</p>
                <p className="text-xs font-medium text-slate-400 mt-1">Toyota Prius (WP CAA-1234) is waiting on Ceramic Brake Pads from Inventory.</p>
              </div>
            </li>
            <li className="flex items-start gap-3 bg-slate-800 p-4 rounded-xl">
              <span className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 shrink-0"></span>
              <div>
                <p className="text-sm font-bold text-slate-100">Quality Inspection Required</p>
                <p className="text-xs font-medium text-slate-400 mt-1">Job Card #4088 (Full Service) completed by Tech-02. Awaiting manager sign-off.</p>
              </div>
            </li>
          </ul>
        </div>
      </div>

    </div>
  );
}