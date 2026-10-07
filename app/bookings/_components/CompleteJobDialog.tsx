"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { useAuth } from "../../context/AuthContext";
import { Booking, errorText, fmtWhen, jobRef, rupees } from "./booking";

interface SparePart {
  id?: number;
  partId?: number;
  partID?: number;
  name: string;
  partCode: string;
  currentStock: number;
  unitPrice: number;
  active?: boolean;
}

// Digital job card: record parts used (deducted from stock in one transaction),
// labour (defaults to the package price) and the diagnostic report. Shows the
// vehicle's previous services for context.
export default function CompleteJobDialog({ booking, onClose, onSaved }: {
  booking: Booking;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [inventory, setInventory] = useState<SparePart[]>([]);
  const [history, setHistory] = useState<Booking[]>([]);
  const [selected, setSelected] = useState<{ partId: number; name: string; qty: number; unitPrice: number; stock: number }[]>([]);
  // A technician can add labour but not go below the quoted package price, and can't
  // close a job with nothing to bill; a manager can do both (the server enforces it).
  const { user } = useAuth();
  const isManager = ["SERVICE_CENTER_MANAGER", "SUPER_ADMIN", "SYSTEM_ADMIN"].includes(user?.role || "");
  const quoted = booking.quotedPrice ?? 0;
  const [labour, setLabour] = useState<number>(booking.quotedPrice ?? 0);
  const [report, setReport] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<SparePart[]>("/parts").then(res => setInventory(res.data)).catch(() => setInventory([]));
    api.get<Booking[]>(`/bookings/vehicle/${encodeURIComponent(booking.vehicleRegNo)}/history`)
      .then(res => setHistory(res.data.filter(h => h.bookingID !== booking.bookingID)))
      .catch(() => setHistory([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per job
  }, [booking.bookingID]);

  const idOf = (p: SparePart) => p.partID || p.partId || p.id || 0;

  const add = (p: SparePart) => {
    const id = idOf(p);
    setSelected(prev => {
      const existing = prev.find(s => s.partId === id);
      if (existing) {
        if (existing.qty >= p.currentStock) return prev;
        return prev.map(s => s.partId === id ? { ...s, qty: s.qty + 1 } : s);
      }
      return [...prev, { partId: id, name: p.name, qty: 1, unitPrice: p.unitPrice, stock: p.currentStock }];
    });
  };

  const partsTotal = selected.reduce((sum, s) => sum + s.qty * s.unitPrice, 0);
  const visibleParts = inventory
    .filter(p => p.currentStock > 0 && p.active !== false) // discontinued parts can't be fitted
    .filter(p => !search || `${p.name} ${p.partCode}`.toLowerCase().includes(search.toLowerCase()));

  const save = async () => {
    setSaving(true);
    setError("");
    const partsUsed: Record<number, number> = {};
    selected.forEach(s => { partsUsed[s.partId] = s.qty; });
    try {
      await api.put(`/bookings/${booking.bookingID}/complete`, { partsUsed, technicianNotes: report, laborCharge: labour });
      onSaved(`${jobRef(booking.bookingID)} completed — parts deducted and the customer told the vehicle is ready.`);
    } catch (err) {
      setError(errorText(err, "Couldn't complete the job. Check stock levels."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="complete-title">
      <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full border border-slate-200 flex flex-col max-h-[90vh]">
        <div className="px-6 md:px-8 py-5 border-b border-slate-100 bg-slate-50 rounded-t-3xl flex justify-between items-center">
          <div>
            <h3 id="complete-title" className="text-2xl font-black text-slate-900">Job Card {jobRef(booking.bookingID)}</h3>
            <p className="text-slate-500 text-sm font-medium mt-1">{booking.servicePackage} · <span className="font-mono">{booking.vehicleRegNo}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 font-bold text-lg" aria-label="Close">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {(booking.managerNotes || booking.customerNotes) && (
            <div className="grid md:grid-cols-2 gap-3">
              {booking.customerNotes && <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-sm text-amber-900"><span className="font-black">Customer: </span>{booking.customerNotes}</div>}
              {booking.managerNotes && <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-sm text-blue-900"><span className="font-black">Manager: </span>{booking.managerNotes}</div>}
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Parts */}
            <div className="lg:col-span-1">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Spare parts</h4>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search parts..." aria-label="Search parts"
                className="w-full mb-2 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500" />
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {visibleParts.map(p => (
                  <div key={idOf(p)} className="flex justify-between items-center p-2.5 border border-slate-200 rounded-xl">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{p.name}</p>
                      <p className="text-xs text-slate-500">Stock {p.currentStock} · {rupees(p.unitPrice)}</p>
                    </div>
                    <button onClick={() => add(p)} className="px-2.5 py-1 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-lg text-xs">+ Add</button>
                  </div>
                ))}
                {visibleParts.length === 0 && <p className="text-sm text-slate-500">No parts in stock{search ? " match" : ""}.</p>}
              </div>
            </div>

            {/* Bill */}
            <div className="lg:col-span-1 bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Parts used</h4>
                {selected.length === 0 ? <p className="text-sm text-slate-500 italic">No parts added.</p> : (
                  <ul className="space-y-2">
                    {selected.map(s => (
                      <li key={s.partId} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-500 tabular-nums">{s.qty} × {rupees(s.unitPrice)}</p>
                        </div>
                        <button onClick={() => setSelected(prev => prev.filter(x => x.partId !== s.partId))} className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg" aria-label={`Remove ${s.name}`}>✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-5 pt-4 border-t border-slate-200 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Parts</span><span className="font-bold tabular-nums">{rupees(partsTotal)}</span></div>
                <div className="flex justify-between items-center">
                  <label htmlFor="labour" className="text-slate-600">Labour <span className="text-xs">(package {rupees(booking.quotedPrice)})</span></label>
                  <input id="labour" type="number" min={isManager ? 0 : quoted} value={labour} onChange={e => setLabour(Number(e.target.value))}
                    className="w-28 px-2 py-1.5 rounded-lg border border-slate-200 text-right font-bold tabular-nums outline-none focus:border-blue-500" />
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200"><span className="font-black">Before tax & discounts</span><span className="font-black tabular-nums">{rupees(partsTotal + labour)}</span></div>
                {!isManager && labour < quoted && <p className="text-xs font-bold text-red-600">Labour can&apos;t be less than the quoted {rupees(quoted)} — ask the manager to approve a lower charge.</p>}
                {!isManager && partsTotal + labour <= 0 && <p className="text-xs font-bold text-red-600">There is nothing to bill — only the manager can close a no-charge job.</p>}
                <p className="text-xs text-slate-500">Active pricing rules (discounts, tax) are applied when you finish.</p>
              </div>
            </div>

            {/* Vehicle history */}
            <div className="lg:col-span-1">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Vehicle history</h4>
              {history.length === 0 ? <p className="text-sm text-slate-500">No previous services on record.</p> : (
                <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {history.map(h => (
                    <li key={h.bookingID} className="p-3 border border-slate-200 rounded-xl">
                      <p className="text-sm font-bold text-slate-900">{h.servicePackage}</p>
                      <p className="text-xs text-slate-500">{fmtWhen(h.completedAt || h.preferredDate)}{h.technicianName ? ` · ${h.technicianName}` : ""}</p>
                      {h.technicianNotes && <p className="text-xs text-slate-700 mt-1 line-clamp-3">{h.technicianNotes}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="report" className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Diagnostic report (sent to the customer)</label>
            <textarea id="report" value={report} onChange={e => setReport(e.target.value)} maxLength={5000}
              placeholder="Work done, findings, and recommendations for next service..."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-sm h-24 resize-none" />
          </div>
          {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        </div>

        <div className="px-6 md:px-8 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200">Cancel</button>
          <button onClick={save} disabled={saving || report.trim().length < 5 || (!isManager && (labour < quoted || partsTotal + labour <= 0))} className="px-6 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Finishing..." : "Finish Job"}
          </button>
        </div>
      </div>
    </div>
  );
}
