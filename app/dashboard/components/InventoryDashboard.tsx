"use client";

export default function InventoryDashboard({ userName }: { userName?: string }) {
  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Warehouse & Inventory</h1>
          <p className="text-sm font-bold text-slate-500 mt-1">Welcome, {userName}. Here is your live stock overview.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-5 py-2.5 bg-blue-600 text-white text-sm font-black uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all">
            Log Delivery
          </button>
        </div>
      </div>

      {/* INVENTORY KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-red-500">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Critical Stock Levels</h3>
          <div className="text-3xl font-black text-slate-900">4 Items</div>
          <p className="text-sm font-bold text-red-600 mt-2">Requires immediate reorder</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Catalog Items</h3>
          <div className="text-3xl font-black text-slate-900">856 SKU</div>
          <p className="text-sm font-bold text-emerald-600 mt-2">Fully inventoried</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Pending Deliveries</h3>
          <div className="text-3xl font-black text-slate-900">2 Shipments</div>
          <p className="text-sm font-bold text-blue-600 mt-2">Expected today</p>
        </div>
      </div>

      {/* STOCK ALERTS LEDGER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl">
          <h2 className="text-xl font-black mb-4">Urgent Actions</h2>
          <ul className="space-y-4">
            <li className="flex items-start gap-3 bg-slate-800 p-4 rounded-xl">
              <span className="w-2 h-2 mt-1.5 rounded-full bg-red-500 shrink-0"></span>
              <div>
                <p className="text-sm font-bold text-slate-100">Ceramic Brake Pads (BP-001)</p>
                <p className="text-xs font-medium text-slate-400 mt-1">Stock level is 0. 3 Job Cards are currently delayed waiting for this part.</p>
              </div>
            </li>
            <li className="flex items-start gap-3 bg-slate-800 p-4 rounded-xl">
              <span className="w-2 h-2 mt-1.5 rounded-full bg-amber-500 shrink-0"></span>
              <div>
                <p className="text-sm font-bold text-slate-100">Synthetic Oil 5W-30 (OIL-5W30)</p>
                <p className="text-xs font-medium text-slate-400 mt-1">Stock dropped below reorder threshold (Current: 14L, Threshold: 20L).</p>
              </div>
            </li>
          </ul>
        </div>
      </div>

    </div>
  );
}