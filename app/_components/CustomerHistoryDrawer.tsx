"use client";

import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";
import { useAuth } from "../context/AuthContext";
import {
  CustomerProfile, Ticket, LoyaltyTransaction, LOYALTY_TYPE_LABEL, TierBadge, StatusBadge, PriorityBadge,
  ticketRef, formatWhen, errorText, signedPoints, CATEGORY_NAMES,
} from "./crm";

const ADJUST_ROLES = ["CUSTOMER_RELATIONS_OFFICER", "SUPER_ADMIN", "SYSTEM_ADMIN"];

interface Booking {
  bookingID: number;
  vehicleRegNo: string;
  servicePackage: string;
  status: string;
  preferredDate: string;
  netTotal: number | null;
}

interface History {
  profile: CustomerProfile;
  bookings: Booking[];
  complaints: Ticket[];
  loyaltyTransactions: LoyaltyTransaction[];
  completedServices: number;
  totalSpent: number;
}

const rupees = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Slide-over with a customer's full service history: profile, membership and
// points ledger, bookings and every support ticket they have raised.
// onChanged lets the parent refresh its list after a points adjustment.
export default function CustomerHistoryDrawer({ customerId, onClose, onChanged }: {
  customerId: number;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const canAdjust = ADJUST_ROLES.includes(user?.role || "");
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjust, setAdjust] = useState({ direction: "add", points: "", reason: "" });
  const [adjustError, setAdjustError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get<History>(`/customers/${customerId}/history`)
      .then(res => setHistory(res.data))
      .catch(() => setError("Couldn't load this customer's history."));
  };

  // Start fresh when a different customer is opened (state adjusted during render, not in an effect).
  const [shownFor, setShownFor] = useState(customerId);
  if (shownFor !== customerId) {
    setShownFor(customerId);
    setHistory(null);
    setError("");
    setAdjustOpen(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when a different customer is opened
  useEffect(() => { load(); }, [customerId]);

  const submitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(adjust.points, 10);
    if (!amount || amount <= 0) { setAdjustError("Enter a whole number of points."); return; }
    setSaving(true);
    setAdjustError("");
    try {
      await api.post(`/loyalty/customers/${customerId}/adjust`, {
        points: adjust.direction === "add" ? amount : -amount,
        reason: adjust.reason,
      });
      setAdjust({ direction: "add", points: "", reason: "" });
      setAdjustOpen(false);
      load();
      onChanged?.();
    } catch (err) {
      setAdjustError(errorText(err, "Couldn't adjust points."));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = history?.profile;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="history-title"
        className="w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <h2 id="history-title" className="text-lg font-black text-slate-900">Customer History</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {error && <p className="p-6 text-sm font-bold text-red-600">{error}</p>}
        {!history && !error && <p className="p-6 text-sm text-slate-500">Loading...</p>}

        {p && history && (
          <div className="p-6 space-y-8">
            <section>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xl font-black text-slate-900">{p.name}</p>
                  <p className="text-sm text-slate-500 mt-1">{p.email} · {p.contactNumber}</p>
                  <p className="font-mono text-sm font-bold text-blue-700 mt-1">{p.vehicleRegNo}</p>
                </div>
                <TierBadge tier={p.membershipTier} />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Customer since {formatWhen(p.registeredAt)} · {p.username ? `Web account: ${p.username}` : "No web account"}
              </p>
            </section>

            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Services", String(history.completedServices)],
                ["Total spent", rupees(history.totalSpent)],
                ["Points", p.loyaltyPoints.toLocaleString()],
                ["Tickets", String(history.complaints.length)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                  <p className="text-base font-black text-slate-900 mt-1 tabular-nums">{value}</p>
                </div>
              ))}
            </section>

            {/* --- MEMBERSHIP & POINTS LEDGER --- */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Membership & Points</h3>
                {canAdjust && !adjustOpen && (
                  <button onClick={() => setAdjustOpen(true)} className="text-xs font-bold text-blue-700 hover:underline">Adjust points</button>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    <span className="text-2xl font-black text-slate-900 tabular-nums">{p.loyaltyPoints.toLocaleString()}</span> points available
                  </p>
                  <p className="text-xs text-slate-500 tabular-nums">{p.lifetimePoints.toLocaleString()} lifetime</p>
                </div>
                {p.nextTier && p.nextTierAt ? (
                  <>
                    <div className="h-2 bg-slate-100 rounded-full mt-3 overflow-hidden" role="progressbar" aria-label={`Progress to ${p.nextTier}`}
                      aria-valuemin={0} aria-valuemax={p.nextTierAt} aria-valuenow={p.lifetimePoints}>
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, (p.lifetimePoints / p.nextTierAt) * 100)}%` }}></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">{p.pointsToNextTier?.toLocaleString()} points to {p.nextTier}</p>
                  </>
                ) : (
                  <p className="text-xs font-bold text-slate-600 mt-2">Top tier reached.</p>
                )}
              </div>

              {adjustOpen && (
                <form onSubmit={submitAdjustment} className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                  <div className="flex gap-3">
                    <select value={adjust.direction} onChange={e => setAdjust({ ...adjust, direction: e.target.value })} aria-label="Add or deduct"
                      className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-blue-500">
                      <option value="add">Add (goodwill)</option>
                      <option value="deduct">Deduct (correction)</option>
                    </select>
                    <input type="number" min={1} max={10000} value={adjust.points} onChange={e => setAdjust({ ...adjust, points: e.target.value })}
                      placeholder="Points" aria-label="Points" className="w-28 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm tabular-nums outline-none focus:border-blue-500" />
                  </div>
                  <input value={adjust.reason} onChange={e => setAdjust({ ...adjust, reason: e.target.value })} maxLength={300}
                    placeholder="Reason, e.g. Compensation for TKT-00012 delay" aria-label="Reason"
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500" />
                  {adjustError && <p className="text-xs font-bold text-red-600">{adjustError}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setAdjustOpen(false); setAdjustError(""); }} className="px-3 py-2 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
                    <button type="submit" disabled={saving || adjust.reason.trim().length < 5}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
                      {saving ? "Saving..." : "Apply"}
                    </button>
                  </div>
                </form>
              )}

              {history.loyaltyTransactions.length === 0 ? (
                <p className="text-sm text-slate-500 mt-3">No points activity yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                  {history.loyaltyTransactions.map(t => (
                    <li key={t.transactionId} className="p-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-800">{t.reason}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatWhen(t.createdAt)} · {t.type === "ADJUSTMENT" ? `Adjusted by ${t.performedBy}` : LOYALTY_TYPE_LABEL[t.type] ?? t.type}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-black tabular-nums ${t.points > 0 ? "text-green-700" : "text-red-700"}`}>{signedPoints(t.points)}</p>
                        <p className="text-xs text-slate-500 tabular-nums">bal. {t.balanceAfter.toLocaleString()}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-3">Service Bookings</h3>
              {history.bookings.length === 0 ? (
                <p className="text-sm text-slate-500">No bookings on record.</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                  {history.bookings.map(b => (
                    <li key={b.bookingID} className="p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{b.servicePackage}</p>
                        <p className="text-xs text-slate-500">JOB-{b.bookingID} · {b.vehicleRegNo} · {formatWhen(b.preferredDate)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">{b.status.replace("_", " ")}</p>
                        {b.netTotal ? <p className="text-xs font-bold text-slate-900 tabular-nums">{rupees(b.netTotal)}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-3">Support Tickets</h3>
              {history.complaints.length === 0 ? (
                <p className="text-sm text-slate-500">No tickets raised.</p>
              ) : (
                <ul className="space-y-2">
                  {history.complaints.map(t => (
                    <li key={t.ticketId} className="border border-slate-200 rounded-2xl p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-500">{ticketRef(t.ticketId)}</span>
                        <span className="text-xs font-bold text-slate-700">{CATEGORY_NAMES[t.category] || t.category}</span>
                        <PriorityBadge priority={t.priority} />
                        <StatusBadge status={t.status} />
                      </div>
                      <p className="text-sm text-slate-600 mt-2">{t.issueDescription}</p>
                      {t.resolutionNote && <p className="text-xs text-green-700 mt-2"><span className="font-bold">Resolution:</span> {t.resolutionNote}</p>}
                      <p className="text-xs text-slate-500 mt-1">Raised {formatWhen(t.dateReported)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
