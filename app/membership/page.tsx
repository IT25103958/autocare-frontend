"use client";

import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";
import { useAuth } from "../context/AuthContext";
import CustomerHistoryDrawer from "../_components/CustomerHistoryDrawer";
import {
  CustomerProfile, LoyaltyTransaction, TierBadge, TIER_ORDER, formatWhen, errorText, signedPoints,
} from "../_components/crm";

interface Settings {
  rupeesPerPoint: number;
  silverPoints: number;
  goldPoints: number;
  platinumPoints: number;
  pointValue: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface Summary {
  totalMembers: number;
  tierCounts: Record<string, number>;
  pointsOutstanding: number;
  lifetimePointsIssued: number;
  pointsIssuedLast30Days: number;
  topMembers: CustomerProfile[];
  nearNextTier: CustomerProfile[];
  recentActivity: LoyaltyTransaction[];
  unsyncedPaidBookings: number;
  settings: Settings;
}

const MANAGE_ROLES = ["CUSTOMER_RELATIONS_OFFICER", "SUPER_ADMIN", "SYSTEM_ADMIN"];
// Changing the programme rules is limited to the CRO (and super admin), matching the API.
const RULE_ROLES = ["CUSTOMER_RELATIONS_OFFICER", "SUPER_ADMIN"];

const tierOf = (lifetime: number, silver: number, gold: number, platinum: number) =>
  lifetime >= platinum ? "PLATINUM" : lifetime >= gold ? "GOLD" : lifetime >= silver ? "SILVER" : "BRONZE";

// CRO view of the loyalty programme: tier spread, top and near-upgrade members,
// and the live points ledger.
export default function MembershipPage() {
  const { user } = useAuth();
  const canManage = MANAGE_ROLES.includes(user?.role || "");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [historyFor, setHistoryFor] = useState<number | null>(null);

  // Programme rules editor
  const canEditRules = RULE_ROLES.includes(user?.role || "");
  const [editingRules, setEditingRules] = useState(false);
  const [rules, setRules] = useState({ rupeesPerPoint: "", silverPoints: "", goldPoints: "", platinumPoints: "", pointValue: "" });
  const [members, setMembers] = useState<CustomerProfile[]>([]);
  const [savingRules, setSavingRules] = useState(false);

  const startEditRules = () => {
    if (!summary) return;
    const st = summary.settings;
    setRules({
      rupeesPerPoint: String(st.rupeesPerPoint),
      silverPoints: String(st.silverPoints),
      goldPoints: String(st.goldPoints),
      platinumPoints: String(st.platinumPoints),
      pointValue: String(st.pointValue),
    });
    setEditingRules(true);
    // Lifetime points of every member, for the live "who changes tier" preview.
    api.get<CustomerProfile[]>("/customers").then(res => setMembers(res.data)).catch(() => setMembers([]));
  };

  const draft = {
    rate: parseInt(rules.rupeesPerPoint, 10),
    silver: parseInt(rules.silverPoints, 10),
    gold: parseInt(rules.goldPoints, 10),
    platinum: parseInt(rules.platinumPoints, 10),
    pointValue: parseFloat(rules.pointValue),
  };
  const draftError =
    !(draft.rate >= 1) ? "Earn rate must be at least Rs. 1 per point."
    : !(draft.pointValue >= 0.01 && draft.pointValue <= 1000) ? "A point must be worth between Rs. 0.01 and Rs. 1,000 when redeemed."
    : !(draft.silver >= 1 && draft.gold >= 1 && draft.platinum >= 1) ? "Enter all three tier thresholds."
    : !(draft.silver < draft.gold && draft.gold < draft.platinum) ? "Thresholds must increase: Silver < Gold < Platinum."
    : "";

  const preview = (() => {
    if (!summary || draftError) return null;
    const st = summary.settings;
    const counts: Record<string, number> = { BRONZE: 0, SILVER: 0, GOLD: 0, PLATINUM: 0 };
    let up = 0, down = 0;
    for (const m of members) {
      const before = TIER_ORDER.indexOf(tierOf(m.lifetimePoints, st.silverPoints, st.goldPoints, st.platinumPoints));
      const afterTier = tierOf(m.lifetimePoints, draft.silver, draft.gold, draft.platinum);
      const after = TIER_ORDER.indexOf(afterTier);
      counts[afterTier]++;
      if (after > before) up++;
      else if (after < before) down++;
    }
    return { counts, up, down };
  })();

  const saveRules = async () => {
    if (draftError) return;
    setSavingRules(true);
    try {
      const res = await api.put<{ customersUpgraded: number; customersDowngraded: number }>("/loyalty/settings", {
        rupeesPerPoint: draft.rate,
        silverPoints: draft.silver,
        goldPoints: draft.gold,
        platinumPoints: draft.platinum,
        pointValue: draft.pointValue,
      });
      setNotice({
        type: "ok",
        text: `Programme rules saved. ${res.data.customersUpgraded} customers moved up a tier, ${res.data.customersDowngraded} moved down. The new earn rate applies to bills paid from now on.`,
      });
      setEditingRules(false);
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't save the programme rules.") });
    } finally {
      setSavingRules(false);
    }
  };

  const load = () => {
    api.get<Summary>("/loyalty/summary")
      .then(res => { setSummary(res.data); setError(""); })
      .catch(() => setError("Couldn't load membership data."));
  };

  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await api.post<{ bookingsCredited: number; pointsAwarded: number; unmatchedBookings: number }>("/loyalty/sync");
      const r = res.data;
      setNotice({
        type: "ok",
        text: `Credited ${r.pointsAwarded.toLocaleString()} points across ${r.bookingsCredited} paid bookings.`
          + (r.unmatchedBookings ? ` ${r.unmatchedBookings} bookings couldn't be matched to a customer profile (register the vehicle, then sync again).` : ""),
      });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Sync failed.") });
    } finally {
      setSyncing(false);
    }
  };

  const s = summary;

  return (
    <div className="p-4 md:p-8 min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="max-w-7xl mx-auto space-y-6">

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Membership & Loyalty</h1>
            <p className="text-slate-500 font-medium mt-1">Lanka Auto Rewards — tiers, points balances and activity.</p>
          </div>
          {canManage && (
            <button onClick={sync} disabled={syncing}
              className="px-5 py-2.5 bg-white border border-slate-200 text-slate-800 text-sm font-black uppercase tracking-wider rounded-xl hover:bg-slate-50 disabled:opacity-50">
              {syncing ? "Syncing..." : "Sync Paid Bookings"}
            </button>
          )}
        </div>

        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        {notice && (
          <div role="status" className={`px-4 py-3 rounded-xl text-sm font-bold border ${notice.type === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
            {notice.text}
          </div>
        )}
        {s && s.unsyncedPaidBookings > 0 && canManage && (
          <div className="px-4 py-3 rounded-xl text-sm border bg-yellow-50 text-yellow-900 border-yellow-200">
            <span className="font-bold">{s.unsyncedPaidBookings} paid bookings haven&apos;t earned points yet</span> (paid before the points ledger existed, or before the customer had a profile). Use <span className="font-bold">Sync Paid Bookings</span> to credit them — each booking is only ever credited once.
          </div>
        )}

        {s && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                ["Members", s.totalMembers.toLocaleString(), "Customer profiles"],
                ["Points outstanding", s.pointsOutstanding.toLocaleString(), "Available to redeem"],
                ["Lifetime points issued", s.lifetimePointsIssued.toLocaleString(), "Drives membership tier"],
                ["Issued last 30 days", s.pointsIssuedLast30Days.toLocaleString(), `1 point per Rs. ${s.settings.rupeesPerPoint}`],
              ].map(([label, value, sub]) => (
                <div key={label} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</h3>
                  <div className="text-3xl font-black text-slate-900 tabular-nums">{value}</div>
                  <p className="text-sm font-bold text-slate-500 mt-1">{sub}</p>
                </div>
              ))}
            </div>

            {/* PROGRAMME RULES */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Programme Rules</h2>
                  <p className="text-sm text-slate-500">
                    Last changed {s.settings.updatedAt ? formatWhen(s.settings.updatedAt) : "—"} by {s.settings.updatedBy === "SYSTEM_DEFAULT" ? "system defaults" : s.settings.updatedBy}
                  </p>
                </div>
                {canEditRules && !editingRules && (
                  <button onClick={startEditRules} className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800">Edit Rules</button>
                )}
              </div>

              {!editingRules ? (
                <dl className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
                  {[
                    ["Earn rate", `1 pt per Rs. ${s.settings.rupeesPerPoint.toLocaleString()}`],
                    ["Redeem value", `1 pt = Rs. ${s.settings.pointValue.toFixed(2)}`],
                    ["Silver from", `${s.settings.silverPoints.toLocaleString()} pts`],
                    ["Gold from", `${s.settings.goldPoints.toLocaleString()} pts`],
                    ["Platinum from", `${s.settings.platinumPoints.toLocaleString()} pts`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                      <dt className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</dt>
                      <dd className="text-base font-black text-slate-900 mt-1 tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {([
                      ["rupeesPerPoint", "Rupees per point", "Rs."],
                      ["pointValue", "Point worth when redeemed", "Rs."],
                      ["silverPoints", "Silver from", "pts"],
                      ["goldPoints", "Gold from", "pts"],
                      ["platinumPoints", "Platinum from", "pts"],
                    ] as const).map(([key, label, unit]) => (
                      <div key={key}>
                        <label htmlFor={`rule-${key}`} className="block text-xs font-bold text-slate-700 mb-1">{label} <span className="font-medium text-slate-500">({unit})</span></label>
                        <input id={`rule-${key}`} type="number" min={key === "pointValue" ? 0.01 : 1} step={key === "pointValue" ? "0.01" : "1"} value={rules[key]}
                          onChange={e => setRules({ ...rules, [key]: e.target.value })}
                          className="w-full px-3 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-sm tabular-nums outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                      </div>
                    ))}
                  </div>

                  {draftError ? (
                    <p className="text-sm font-bold text-red-600">{draftError}</p>
                  ) : (
                    <div className="rounded-2xl bg-blue-50/60 border border-blue-100 p-4 text-sm text-slate-700">
                      <p>
                        A Rs. 10,000 bill will earn <span className="font-bold">{Math.floor(10000 / draft.rate).toLocaleString()} points</span>,
                        worth <span className="font-bold">Rs. {(Math.floor(10000 / draft.rate) * draft.pointValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> off a future bill
                        ({((draft.pointValue / draft.rate) * 100).toFixed(2)}% back).
                        {" "}Rate changes apply to bills paid from now on — points already earned stay as they are.
                      </p>
                      {preview && members.length > 0 && (
                        <p className="mt-2">
                          With these thresholds: {TIER_ORDER.map(t => `${preview.counts[t]} ${t.charAt(0) + t.slice(1).toLowerCase()}`).join(" · ")}.
                          {" "}<span className="font-bold">{preview.up} would move up, {preview.down} would move down</span> immediately.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <button onClick={() => setEditingRules(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
                    <button onClick={saveRules} disabled={!!draftError || savingRules}
                      className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
                      {savingRules ? "Saving..." : "Save Rules"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* TIER SPREAD */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <h2 className="text-lg font-black text-slate-900 mb-4">Members by Tier</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {TIER_ORDER.map(tier => {
                  const count = s.tierCounts[tier] ?? 0;
                  const share = s.totalMembers ? Math.round((count / s.totalMembers) * 100) : 0;
                  const from = { BRONZE: 0, SILVER: s.settings.silverPoints, GOLD: s.settings.goldPoints, PLATINUM: s.settings.platinumPoints }[tier];
                  return (
                    <div key={tier} className="rounded-2xl border border-slate-200 p-4">
                      <TierBadge tier={tier} />
                      <p className="text-3xl font-black text-slate-900 mt-3 tabular-nums">{count}</p>
                      <p className="text-sm text-slate-500">{share}% of members</p>
                      <p className="text-xs text-slate-500 mt-2">From {from.toLocaleString()} lifetime pts</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* TOP MEMBERS */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                <h2 className="text-lg font-black text-slate-900 mb-4">Top Members</h2>
                {s.topMembers.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4">No points earned yet. Points are credited when a service bill is paid.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
                        <th className="text-left py-2">#</th>
                        <th className="text-left py-2">Customer</th>
                        <th className="text-left py-2">Tier</th>
                        <th className="text-right py-2">Lifetime</th>
                        <th className="text-right py-2">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.topMembers.map((m, i) => (
                        <tr key={m.customerID} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => setHistoryFor(m.customerID)}>
                          <td className="py-2 text-slate-500 tabular-nums">{i + 1}</td>
                          <td className="py-2">
                            <button className="font-bold text-slate-900 hover:text-blue-700 text-left">{m.name}</button>
                            <div className="text-xs font-mono text-slate-500">{m.vehicleRegNo}</div>
                          </td>
                          <td className="py-2"><TierBadge tier={m.membershipTier} /></td>
                          <td className="py-2 text-right tabular-nums font-bold">{m.lifetimePoints.toLocaleString()}</td>
                          <td className="py-2 text-right tabular-nums">{m.loyaltyPoints.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* NEAR NEXT TIER */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                <h2 className="text-lg font-black text-slate-900 mb-1">Close to an Upgrade</h2>
                <p className="text-sm text-slate-500 mb-4">Within 10% of their next tier — good candidates for a follow-up call.</p>
                {s.nearNextTier.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4">No customers are close to the next tier right now.</p>
                ) : (
                  <ul className="space-y-3">
                    {s.nearNextTier.map(m => (
                      <li key={m.customerID}>
                        <button onClick={() => setHistoryFor(m.customerID)} className="w-full text-left rounded-xl p-3 hover:bg-slate-50 border border-slate-100">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-bold text-slate-900">{m.name}</p>
                            <p className="text-xs font-bold text-slate-700">
                              <TierBadge tier={m.membershipTier} /> <span aria-hidden="true">→</span> <TierBadge tier={m.nextTier || ""} />
                            </p>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, (m.lifetimePoints / (m.nextTierAt || 1)) * 100)}%` }}></div>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 tabular-nums">{m.pointsToNextTier?.toLocaleString()} points to go</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* RECENT ACTIVITY */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <h2 className="text-lg font-black text-slate-900 mb-4">Recent Points Activity</h2>
              {s.recentActivity.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">No points activity yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
                        <th className="text-left py-2">When</th>
                        <th className="text-left py-2">Customer</th>
                        <th className="text-left py-2">Details</th>
                        <th className="text-left py-2">By</th>
                        <th className="text-right py-2">Points</th>
                        <th className="text-right py-2">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.recentActivity.map(t => (
                        <tr key={t.transactionId} className="border-b border-slate-50">
                          <td className="py-2 text-slate-500 whitespace-nowrap">{formatWhen(t.createdAt)}</td>
                          <td className="py-2">
                            <button onClick={() => setHistoryFor(t.customerId)} className="font-bold text-slate-900 hover:text-blue-700 text-left">{t.customerName}</button>
                          </td>
                          <td className="py-2 text-slate-600">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mr-2">{t.type === "EARNED" ? "Earned" : "Adjusted"}</span>
                            {t.reason}
                          </td>
                          <td className="py-2 text-slate-500">{t.performedBy}</td>
                          <td className={`py-2 text-right font-black tabular-nums ${t.points > 0 ? "text-green-700" : "text-red-700"}`}>{signedPoints(t.points)}</td>
                          <td className="py-2 text-right tabular-nums">{t.balanceAfter.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {historyFor !== null && <CustomerHistoryDrawer customerId={historyFor} onClose={() => setHistoryFor(null)} onChanged={load} />}
    </div>
  );
}
