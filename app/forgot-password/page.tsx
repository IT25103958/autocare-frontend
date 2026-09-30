"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import axios from "axios";

// Plain axios on purpose: this page is used while signed out, so no token
// should be attached.
const API = "http://localhost:8080/api";

// Same rules as the backend's PasswordPolicy.
function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "At least 8 characters.";
  if (!/[A-Za-z]/.test(pw)) return "Include at least one letter.";
  if (!/[0-9]/.test(pw)) return "Include at least one number.";
  return null;
}

// Backend answers are either { status, message } objects or plain strings.
function messageOf(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string")
    return (data as { message: string }).message;
  return fallback;
}

const inputCls = "mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold normal-case tracking-normal text-slate-900 outline-none focus:border-blue-500";
const labelCls = "block text-xs font-black text-slate-500 uppercase tracking-widest";

type Step = "request" | "reset" | "done";

function ForgotPasswordFlow() {
  // The emailed one-click link (only sent once the app is hosted) opens
  // this page with ?id=<username>&code=<code> already filled in.
  const params = useSearchParams();
  const linkId = params.get("id") ?? "";
  const linkCode = params.get("code") ?? "";

  const [step, setStep] = useState<Step>(linkId && linkCode ? "reset" : "request");
  const [identifier, setIdentifier] = useState(linkId);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [code, setCode] = useState(linkCode);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Countdown for "resend code".
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  // Step 1: look the account up and email a code.
  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    setNotice("");
    if (!identifier.trim()) { setError("Enter your username or email address."); return; }
    setBusy(true);
    try {
      const res = await axios.post(`${API}/auth/forgot-password`, { identifier: identifier.trim() });
      setMaskedEmail(res.data.maskedEmail);
      setNotice(res.data.message);
      setStep("reset");
      setResendIn(60);
    } catch (err) {
      const data = (err as { response?: { data?: { status?: string; maskedEmail?: string; retryAfterSeconds?: number } } })?.response?.data;
      if (data?.status === "TOO_SOON") {
        // A code is already on its way — move on to entering it.
        setMaskedEmail(data.maskedEmail ?? "");
        setNotice(messageOf(err, ""));
        setStep("reset");
        setResendIn(data.retryAfterSeconds ?? 60);
      } else {
        setError(messageOf(err, "Couldn't reach the server. Please try again in a moment."));
      }
    } finally {
      setBusy(false);
    }
  };

  // Step 2: code + new password.
  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code.trim())) { setError("Enter the 6-digit code from the email."); return; }
    const problem = passwordProblem(password);
    if (problem) { setError(problem); return; }
    if (password !== confirm) { setError("The passwords don't match."); return; }
    setBusy(true);
    try {
      await axios.post(`${API}/auth/reset-password`, { identifier: identifier.trim(), code: code.trim(), newPassword: password });
      setStep("done");
    } catch (err) {
      setError(messageOf(err, "Couldn't reset the password. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (step === "done") {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Password updated</h1>
        <p className="text-sm text-slate-500 font-medium">You can now sign in with your new password. We&apos;ve also emailed you a confirmation.</p>
        <Link href="/login" className="inline-block mt-6 px-5 py-3 rounded-xl bg-slate-900 hover:bg-blue-600 text-white text-sm font-black">
          Go to sign in
        </Link>
      </div>
    );
  }

  if (step === "reset") {
    return (
      <form onSubmit={resetPassword} className="space-y-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Enter your reset code</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            {maskedEmail
              ? <>We emailed a 6-digit code to <span className="font-bold text-slate-700">{maskedEmail}</span>. It expires in 10 minutes.</>
              : "Enter the 6-digit code from your email and choose a new password."}
          </p>
        </div>
        {notice && !maskedEmail && <p className="text-sm font-bold text-emerald-700">{notice}</p>}

        <label className={labelCls}>
          6-digit code
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus={!linkCode}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${inputCls} text-center text-2xl tracking-[0.5em] font-mono`} placeholder="••••••" />
        </label>
        <label className={labelCls}>
          New password
          <input type="password" autoComplete="new-password" autoFocus={!!linkCode} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          <span className="block mt-1 text-[11px] font-medium normal-case tracking-normal text-slate-400">At least 8 characters, with a letter and a number.</span>
        </label>
        <label className={labelCls}>
          Confirm new password
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
        </label>

        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-blue-600 text-white font-black disabled:opacity-60">
          {busy ? "Saving..." : "Reset Password"}
        </button>

        <div className="flex justify-between text-xs font-bold">
          <button type="button" onClick={() => { setStep("request"); setCode(""); setError(""); }} className="text-slate-400 hover:text-slate-600">
            Use a different account
          </button>
          <button type="button" onClick={() => requestCode()} disabled={busy || resendIn > 0} className="text-blue-600 hover:text-blue-800 disabled:text-slate-300">
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Forgot your password?</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Enter your username or the email address on your account. We&apos;ll email you a 6-digit code to reset your password.
        </p>
      </div>
      <label className={labelCls}>
        Username or email
        <input autoFocus autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inputCls} />
      </label>
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm font-bold text-red-700">{error}</div>
      )}
      <button type="submit" disabled={busy} className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-blue-600 text-white font-black disabled:opacity-60">
        {busy ? "Checking..." : "Send Reset Code"}
      </button>
      <Link href="/login" className="block text-center text-xs font-bold text-slate-400 hover:text-slate-600">Back to sign in</Link>
    </form>
  );
}

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-md p-8 rounded-3xl border border-slate-200 shadow-sm">
        {/* useSearchParams must sit inside a Suspense boundary, or the
            production build fails for this prerendered route. */}
        <Suspense fallback={<p className="text-center text-sm font-bold text-slate-400">Loading...</p>}>
          <ForgotPasswordFlow />
        </Suspense>
      </div>
    </div>
  );
}
