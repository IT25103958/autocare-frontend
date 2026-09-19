"use client";

export default function FuelDashboard({ userName }: { userName?: string }) {
  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Fuel Telemetry</h1>
          <p className="text-sm font-bold text-slate-500 mt-1">Welcome, {userName}. Live tank levels and pump data.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-5 py-2.5 bg-blue-600 text-white text-sm font-black uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all">
            Update Pump Rates
          </button>
        </div>
      </div>

      {/* TANK TELEMETRY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-t-4 border-t-amber-500 relative overflow-hidden">
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-amber-50 rounded-full opacity-50"></div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Petrol 92 Octane (Tank A)</h3>
          <div className="text-3xl font-black text-slate-900">4,200 L</div>
          <div className="w-full bg-slate-100 h-2 mt-4 rounded-full overflow-hidden">
            <div className="bg-amber-500 h-full w-[42%]"></div>
          </div>
          <p className="text-xs font-bold text-amber-600 mt-2">42% Capacity Remaining</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-t-4 border-t-blue-500 relative overflow-hidden">
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-blue-50 rounded-full opacity-50"></div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Auto Diesel (Tank B)</h3>
          <div className="text-3xl font-black text-slate-900">8,500 L</div>
          <div className="w-full bg-slate-100 h-2 mt-4 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full w-[85%]"></div>
          </div>
          <p className="text-xs font-bold text-blue-600 mt-2">85% Capacity Remaining</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-t-4 border-t-emerald-500">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Today's Pump Revenue</h3>
          <div className="text-3xl font-black text-slate-900">Rs. 340,000</div>
          <p className="text-sm font-bold text-emerald-600 mt-2">Across 4 active pumps</p>
        </div>
      </div>

      {/* FUEL LOGISTICS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl">
          <h2 className="text-xl font-black mb-4">Logistics & Deliveries</h2>
          <ul className="space-y-4">
            <li className="flex items-start gap-3 bg-slate-800 p-4 rounded-xl">
              <span className="w-2 h-2 mt-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse"></span>
              <div>
                <p className="text-sm font-bold text-slate-100">Scheduled Bowser Arrival</p>
                <p className="text-xs font-medium text-slate-400 mt-1">6,600L of Petrol 92 expected today at 14:00 from CEYPETCO.</p>
              </div>
            </li>
            <li className="flex items-start gap-3 bg-slate-800 p-4 rounded-xl">
              <span className="w-2 h-2 mt-1.5 rounded-full bg-slate-500 shrink-0"></span>
              <div>
                <p className="text-sm font-bold text-slate-100">Pump Maintenance</p>
                <p className="text-xs font-medium text-slate-400 mt-1">Pump #02 (Diesel) scheduled for filter calibration tomorrow morning.</p>
              </div>
            </li>
          </ul>
        </div>
      </div>

    </div>
  );
}