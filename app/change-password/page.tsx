"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import api from "../../utils/axiosInstance";
import { getErrorMessage } from "../../utils/apiError";

// Same rules as the backend's PasswordPolicy.
function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "At least 8 characters.";
  if (!/[A-Za-z]/.test(pw)) return "Include at least one letter.";
  if (!/[0-9]/.test(pw)) return "Include at least one number.";
  return null;
}

export default function ChangePasswordPage() {
  const { user, markPasswordChanged, logout } = useAuth();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const forced = user?.mustChangePassword === true;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const problem = passwordProblem(next);
    if (problem) { setError(problem); return; }
    if (next !== confirm) { setError("The new passwords don't match."); return; }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: next });
      markPasswordChanged();
      router.replace("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't change the password."));
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return <div className="p-12 text-center text-slate-500 font-bold">Please sign in first.</div>;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 flex items-center justify-center p-6">
      <form onSubmit={submit} className="bg-white w-full max-w-md p-8 rounded-3xl border border-slate-200 shadow-sm space-y-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{forced ? "Choose Your Password" : "Change Password"}</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            {forced
              ? "You signed in with a temporary password. Choose your own before continuing."
              : `Signed in as ${user.username}.`}
          </p>
        </div>

        <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">
          {forced ? "Temporary password" : "Current password"}
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)}
            className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold normal-case tracking-normal text-slate-900 outline-none focus:border-blue-500" />
        </label>
        <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">
          New password
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)}
            className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold normal-case tracking-normal text-slate-900 outline-none focus:border-blue-500" />
          <span className="block mt-1 text-[11px] font-medium normal-case tracking-normal text-slate-400">At least 8 characters, with a letter and a number.</span>
        </label>
        <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">
          Confirm new password
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold normal-case tracking-normal text-slate-900 outline-none focus:border-blue-500" />
        </label>

        {error && <p className="text-sm font-bold text-red-600">{error}</p>}

        <button type="submit" disabled={saving} className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-blue-600 text-white font-black disabled:opacity-60">
          {saving ? "Saving..." : "Save Password"}
        </button>
        {forced && (
          <button type="button" onClick={logout} className="w-full text-xs font-bold text-slate-400 hover:text-slate-600">Sign out instead</button>
        )}
      </form>
    </div>
  );
}
