"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "../../../utils/axiosInstance";
import { CustomerProfile, LoyaltyTransaction, TierBadge, errorText, formatWhen, signedPoints } from "../../_components/crm";

export default function ProfileSettings() {
  // undefined = loading, null = profile not completed yet
  const [profile, setProfile] = useState<CustomerProfile | null | undefined>(undefined);
  const [form, setForm] = useState({ name: "", vehicleRegNo: "", contactNumber: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [activity, setActivity] = useState<LoyaltyTransaction[]>([]);
  const [rupeesPerPoint, setRupeesPerPoint] = useState<number | null>(null);

  const applyProfile = (p: CustomerProfile) => {
    setProfile(p);
    setForm({ name: p.name, vehicleRegNo: p.vehicleRegNo, contactNumber: p.contactNumber });
  };

  useEffect(() => {
    api.get<CustomerProfile>("/customers/my-profile")
      .then(res => applyProfile(res.data))
      .catch(() => setProfile(null));
    api.get<LoyaltyTransaction[]>("/loyalty/my-transactions")
      .then(res => setActivity(res.data))
      .catch(() => setActivity([]));
    api.get<{ rupeesPerPoint: number }>("/loyalty/settings")
      .then(res => setRupeesPerPoint(res.data.rupeesPerPoint))
      .catch(() => setRupeesPerPoint(null));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = profile
        ? await api.put<CustomerProfile>("/customers/my-profile", form)
        : await api.post<CustomerProfile>("/customers/my-profile", { vehicleRegNo: form.vehicleRegNo, contactNumber: form.contactNumber });
      applyProfile(res.data);
      setMessage({ type: "ok", text: "Changes saved." });
    } catch (err) {
      setMessage({ type: "error", text: errorText(err, "Couldn't save your changes.") });
    } finally {
      setSaving(false);
    }
  };

  if (profile === undefined) return null;

  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all";

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mb-8 flex items-center justify-between max-w-5xl mx-auto gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Account Settings</h1>
          <p className="text-slate-500 font-medium mt-1">Your profile, vehicle and membership.</p>
        </div>
        <Link href="/customers/dashboard" className="text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors whitespace-nowrap">
          &larr; Back to Dashboard
        </Link>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleSave} className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Personal Information</h2>
          {profile === null && (
            <p className="text-sm text-slate-500 mb-4">Add your vehicle and contact number to finish setting up your profile.</p>
          )}
          <div className="space-y-5 mt-4">
            {profile && (
              <div>
                <label htmlFor="p-name" className="block text-sm font-bold text-slate-700 mb-1">Full Name</label>
                <input id="p-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="p-vehicle" className="block text-sm font-bold text-slate-700 mb-1">Vehicle Registration</label>
                <input id="p-vehicle" required value={form.vehicleRegNo} placeholder="CBA-1234"
                  onChange={e => setForm({ ...form, vehicleRegNo: e.target.value })} className={`${inputClass} font-mono uppercase`} />
              </div>
              <div>
                <label htmlFor="p-phone" className="block text-sm font-bold text-slate-700 mb-1">Phone Number</label>
                <input id="p-phone" required type="tel" value={form.contactNumber} placeholder="+94 77 123 4567"
                  onChange={e => setForm({ ...form, contactNumber: e.target.value })} className={inputClass} />
              </div>
            </div>
            {profile && (
              <div>
                <p className="block text-sm font-bold text-slate-700 mb-1">Email Address</p>
                <p className="text-sm text-slate-600">{profile.email}</p>
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <span role="status" className={`font-bold text-sm ${message?.type === "error" ? "text-red-600" : "text-green-700"}`}>{message?.text}</span>
            <button type="submit" disabled={saving} className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-6 rounded-lg transition-colors disabled:opacity-70">
              {saving ? "Saving..." : profile ? "Save Changes" : "Complete Profile"}
            </button>
          </div>
        </form>

        <div className="space-y-6">
          {profile && (
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-2xl shadow-lg text-white">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">Lanka Auto Rewards</h2>
                <TierBadge tier={profile.membershipTier} />
              </div>
              <p className="text-4xl font-black mt-4 tabular-nums">{profile.loyaltyPoints.toLocaleString()} <span className="text-sm font-bold text-slate-300">points</span></p>
              {rupeesPerPoint && (
                <p className="text-xs text-slate-300 mt-2">You earn 1 point for every Rs. {rupeesPerPoint.toLocaleString()} spent on servicing.</p>
              )}
              {profile.nextTier && profile.nextTierAt ? (
                <>
                  <div className="h-2 bg-white/10 rounded-full mt-4 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={profile.nextTierAt} aria-valuenow={profile.lifetimePoints} aria-label={`Progress to ${profile.nextTier}`}>
                    <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${Math.min(100, (profile.lifetimePoints / profile.nextTierAt) * 100)}%` }}></div>
                  </div>
                  <p className="text-xs text-slate-300 mt-2">{profile.pointsToNextTier?.toLocaleString()} more points to {profile.nextTier}</p>
                </>
              ) : (
                <p className="text-xs text-yellow-300 font-bold mt-4">You&apos;ve reached our top tier. Thank you!</p>
              )}
            </div>
          )}

          {profile && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="font-bold text-slate-800 mb-3">Points Activity</h2>
              {activity.length === 0 ? (
                <p className="text-sm text-slate-500">No points yet — you&apos;ll earn them when you pay for a service.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activity.slice(0, 8).map(t => (
                    <li key={t.transactionId} className="py-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-700">{t.type === "EARNED" ? `Service Job #${t.bookingId}` : t.reason}</p>
                        <p className="text-xs text-slate-500">{formatWhen(t.createdAt)}</p>
                      </div>
                      <p className={`text-sm font-black tabular-nums ${t.points > 0 ? "text-green-700" : "text-red-700"}`}>{signedPoints(t.points)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="font-bold text-slate-800">Password & Security</h2>
            <p className="text-sm text-slate-500 mt-1 mb-4">Change the password you use to sign in.</p>
            <Link href="/change-password" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg text-sm">
              Change Password
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
