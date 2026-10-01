"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { downloadReceipt, errText, fmtWhen, lkr } from "../../billing/_components/billing";

// ---------------------------------------------------------------------------
// Demo payment gateway. Laid out like a hosted checkout page: order summary on
// the left, payment methods on the right, then a result screen. It is a
// sandbox — no real money moves and nothing typed here is stored.
// ---------------------------------------------------------------------------

interface Option { code: string; name: string }

interface Session {
  token: string;
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED";
  merchant: string;
  invoiceId: number;
  invoiceNumber: string;
  description: string;
  amount: number;
  pointsToRedeem: number;
  secondsLeft: number;
  attemptsLeft: number;
  lastError: string | null;
  reference: string | null;
  receiptNumber: string | null;
  methodLabel: string | null;
  completedAt: string | null;
  banks: Option[];
  wallets: Option[];
}

type Method = "CARD" | "BANK" | "WALLET";

const GATEWAY = "PayBridge";
const RETURN_URL = "/customers/dashboard";
const SANDBOX_OTP = "123456";

const METHODS: { key: Method; label: string; hint: string; icon: string }[] = [
  { key: "CARD", label: "Card", hint: "Visa, Mastercard, Amex", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
  { key: "BANK", label: "Online banking", hint: "Pay from your account", icon: "M3 21h18M5 21V10m4 11V10m6 11V10m4 11V10M3 10l9-6 9 6H3z" },
  { key: "WALLET", label: "Mobile wallet", hint: "Confirm with a code", icon: "M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" },
];

const LOCK = "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z";

const Glyph = ({ d, className = "w-5 h-5" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const field = "w-full px-3.5 py-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 outline-none transition-shadow focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15";
const labelClass = "block text-xs font-bold text-slate-700 mb-1.5";

const formatCard = (v: string) => v.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};
const cardBrand = (digits: string) => {
  if (digits.startsWith("4")) return "VISA";
  const two = Number(digits.slice(0, 2));
  const four = Number(digits.slice(0, 4));
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) return "MASTERCARD";
  if (two === 34 || two === 37) return "AMEX";
  return "";
};
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
// A short pause so the "contacting your bank" step is visible, as on a real gateway.
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function GatewayPage() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [method, setMethod] = useState<Method>("CARD");
  const [processing, setProcessing] = useState(false);
  const [formError, setFormError] = useState("");

  const [card, setCard] = useState({ cardNumber: "", expiry: "", cvc: "", cardholderName: "" });
  const [bank, setBank] = useState({ bankCode: "", accountNumber: "", accountHolder: "" });
  const [wallet, setWallet] = useState({ walletProvider: "", mobileNumber: "", otp: "" });
  const [otpSent, setOtpSent] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);

  const accept = useCallback((s: Session) => {
    setSession(s);
    setSecondsLeft(s.secondsLeft);
  }, []);

  // Fetch the session on arrival, and again whenever reloadKey changes
  // ("Try again", or the countdown reaching zero so the server can expire it).
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    api.get<Session>(`/gateway/sessions/${token}`)
      .then(res => { accept(res.data); setLoadError(""); })
      .catch(err => setLoadError(errText(err, "We couldn't open this payment. Check your connection and try again.")));
  }, [token, reloadKey, accept]);

  const pending = session?.status === "PENDING";
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      setSecondsLeft(s => {
        if (s === 1) setReloadKey(k => k + 1);
        return Math.max(0, s - 1);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pending]);

  const cardDigits = card.cardNumber.replace(/\D/g, "");
  const ready = method === "CARD"
    ? cardDigits.length >= 13 && card.expiry.length === 5 && card.cvc.length >= 3 && card.cardholderName.trim().length >= 2
    : method === "BANK"
      ? !!bank.bankCode && bank.accountNumber.replace(/\D/g, "").length >= 8 && bank.accountHolder.trim().length >= 2
      : !!wallet.walletProvider && /^07\d{8}$/.test(wallet.mobileNumber) && otpSent && wallet.otp.length === 6;

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !ready) return;
    setProcessing(true);
    setFormError("");
    try {
      const body = method === "CARD" ? card : method === "BANK" ? bank : wallet;
      const [res] = await Promise.all([api.post<Session>(`/gateway/sessions/${token}/pay`, { method, ...body }), pause(1600)]);
      accept(res.data);
      if (res.data.status === "PENDING") setWallet(w => ({ ...w, otp: "" }));
    } catch (err) {
      setFormError(errText(err, "The payment couldn't be processed. Please try again."));
    } finally {
      setProcessing(false);
    }
  };

  const cancel = async () => {
    setProcessing(true);
    try {
      const res = await api.post<Session>(`/gateway/sessions/${token}/cancel`);
      accept(res.data);
    } catch (err) {
      setFormError(errText(err, "Couldn't cancel the payment."));
    } finally {
      setProcessing(false);
    }
  };

  const chooseMethod = (m: Method) => {
    setMethod(m);
    setFormError("");
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Gateway header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center">
              <Glyph d={LOCK} className="w-5 h-5" />
            </span>
            <span className="text-xl font-black tracking-tight text-slate-900">Pay<span className="text-indigo-600">Bridge</span></span>
            <span className="ml-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest">Sandbox</span>
          </div>
          <p className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-slate-500"><Glyph d={LOCK} className="w-4 h-4 text-emerald-600" /> Secure checkout</p>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 sm:py-12">
        <div className="max-w-5xl mx-auto">
          {/* Could not load */}
          {!session && loadError && (
            <div className="max-w-md mx-auto bg-white rounded-3xl border border-slate-200 shadow-xl p-8 text-center">
              <h1 className="text-xl font-black text-slate-900">Payment unavailable</h1>
              <p className="mt-2 text-sm text-slate-600">{loadError}</p>
              <div className="mt-6 flex flex-col gap-2">
                <button onClick={() => setReloadKey(k => k + 1)} className="py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700">Try again</button>
                <Link href={RETURN_URL} className="py-2 text-sm font-bold text-slate-600 hover:text-slate-900">Return to Lanka Auto Care</Link>
              </div>
            </div>
          )}

          {!session && !loadError && <div className="max-w-md mx-auto h-64 rounded-3xl bg-white/70 animate-pulse" aria-label="Loading payment" />}

          {/* Finished: paid, failed, cancelled or expired */}
          {session && session.status !== "PENDING" && <Result session={session} />}

          {/* Checkout */}
          {session && session.status === "PENDING" && (
            <div className="grid lg:grid-cols-[1fr_1.35fr] rounded-3xl overflow-hidden shadow-2xl shadow-slate-900/10 bg-white border border-slate-200">
              {/* Order summary */}
              <aside className="relative bg-[#0a1430] text-white p-7 sm:p-9 flex flex-col overflow-hidden">
                <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-indigo-600/30 blur-3xl" aria-hidden="true" />
                <div className="relative">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-200">Paying</p>
                  <p className="mt-1 text-lg font-black">{session.merchant}</p>
                  <p className="mt-8 text-[11px] font-black uppercase tracking-[0.2em] text-indigo-200">Amount</p>
                  <p className="mt-1 text-4xl sm:text-5xl font-black tracking-tight tabular-nums">{lkr(session.amount)}</p>

                  <dl className="mt-8 space-y-3 text-sm border-t border-white/10 pt-6">
                    <div className="flex justify-between gap-4"><dt className="text-slate-300">Invoice</dt><dd className="font-mono font-bold">{session.invoiceNumber}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-slate-300 shrink-0">For</dt><dd className="font-bold text-right">{session.description}</dd></div>
                    {session.pointsToRedeem > 0 && (
                      <div className="flex justify-between gap-4"><dt className="text-slate-300">Loyalty points</dt><dd className="font-bold">{session.pointsToRedeem.toLocaleString()} applied on payment</dd></div>
                    )}
                  </dl>
                </div>

                <div className="relative mt-auto pt-10">
                  <div className={`rounded-2xl px-4 py-3 flex items-center justify-between ${secondsLeft <= 60 ? "bg-rose-500/20 text-rose-100" : "bg-white/10 text-slate-200"}`}>
                    <span className="text-xs font-bold">This page expires in</span>
                    <span className="text-lg font-black tabular-nums" role="timer">{clock(secondsLeft)}</span>
                  </div>
                  <button type="button" onClick={cancel} disabled={processing} className="mt-4 text-sm font-bold text-slate-300 hover:text-white disabled:opacity-50">
                    ← Cancel and return to Lanka Auto Care
                  </button>
                </div>
              </aside>

              {/* Payment methods */}
              <section className="relative p-7 sm:p-9">
                <h1 className="text-xl font-black text-slate-900">How would you like to pay?</h1>

                <div className="mt-5 grid grid-cols-3 gap-2" role="tablist" aria-label="Payment method">
                  {METHODS.map(m => (
                    <button key={m.key} type="button" role="tab" aria-selected={method === m.key} onClick={() => chooseMethod(m.key)}
                      className={`rounded-2xl border-2 px-3 py-3 text-left transition-all ${method === m.key ? "border-indigo-600 bg-indigo-50/70 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}>
                      <Glyph d={m.icon} className={`w-6 h-6 ${method === m.key ? "text-indigo-600" : "text-slate-500"}`} />
                      <span className="mt-2 block text-sm font-black text-slate-900">{m.label}</span>
                      <span className="hidden sm:block text-[11px] text-slate-500">{m.hint}</span>
                    </button>
                  ))}
                </div>

                {session.lastError && !formError && (
                  <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm font-bold text-red-700">{session.lastError}</p>
                    <p className="text-xs text-red-700/80 mt-0.5">{session.attemptsLeft} attempt{session.attemptsLeft === 1 ? "" : "s"} left. You have not been charged.</p>
                  </div>
                )}
                {formError && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{formError}</p>}

                <form onSubmit={pay} className="mt-5 space-y-4">
                  {method === "CARD" && (
                    <>
                      {/* Live card preview */}
                      <div className="rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 text-white p-5 shadow-lg">
                        <div className="flex items-center justify-between">
                          <span className="w-10 h-7 rounded-md bg-gradient-to-br from-amber-200 to-amber-400" aria-hidden="true" />
                          <span className="text-sm font-black italic tracking-wider">{cardBrand(cardDigits) || "CARD"}</span>
                        </div>
                        <p className="mt-6 font-mono text-lg tracking-[0.18em]">{(card.cardNumber || "•••• •••• •••• ••••").padEnd(19, "•")}</p>
                        <div className="mt-4 flex justify-between text-xs">
                          <span className="uppercase tracking-wider truncate max-w-[65%]">{card.cardholderName || "Name on card"}</span>
                          <span className="font-mono">{card.expiry || "MM/YY"}</span>
                        </div>
                      </div>
                      <div>
                        <label htmlFor="gw-number" className={labelClass}>Card number</label>
                        <input id="gw-number" inputMode="numeric" autoComplete="cc-number" value={card.cardNumber} placeholder="1234 5678 9012 3456"
                          onChange={e => setCard({ ...card, cardNumber: formatCard(e.target.value) })} className={`${field} font-mono tracking-wider`} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="gw-exp" className={labelClass}>Expiry</label>
                          <input id="gw-exp" inputMode="numeric" autoComplete="cc-exp" value={card.expiry} placeholder="MM/YY"
                            onChange={e => setCard({ ...card, expiry: formatExpiry(e.target.value) })} className={`${field} font-mono`} />
                        </div>
                        <div>
                          <label htmlFor="gw-cvc" className={labelClass}>Security code</label>
                          <input id="gw-cvc" inputMode="numeric" autoComplete="cc-csc" value={card.cvc} maxLength={4} placeholder="CVC"
                            onChange={e => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "") })} className={`${field} font-mono`} />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="gw-name" className={labelClass}>Name on card</label>
                        <input id="gw-name" autoComplete="cc-name" value={card.cardholderName} onChange={e => setCard({ ...card, cardholderName: e.target.value })} className={field} />
                      </div>
                    </>
                  )}

                  {method === "BANK" && (
                    <>
                      <fieldset>
                        <legend className={labelClass}>Your bank</legend>
                        <div className="grid grid-cols-2 gap-2" role="radiogroup">
                          {session.banks.map(b => (
                            <button key={b.code} type="button" role="radio" aria-checked={bank.bankCode === b.code} onClick={() => setBank({ ...bank, bankCode: b.code })}
                              className={`rounded-xl border-2 px-3 py-2.5 text-left text-sm font-bold transition-colors ${bank.bankCode === b.code ? "border-indigo-600 bg-indigo-50/70 text-indigo-900" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                              {b.name}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <div>
                        <label htmlFor="gw-account" className={labelClass}>Account number</label>
                        <input id="gw-account" inputMode="numeric" value={bank.accountNumber} maxLength={16} placeholder="8 to 16 digits"
                          onChange={e => setBank({ ...bank, accountNumber: e.target.value.replace(/\D/g, "") })} className={`${field} font-mono tracking-wider`} />
                      </div>
                      <div>
                        <label htmlFor="gw-holder" className={labelClass}>Account holder</label>
                        <input id="gw-holder" value={bank.accountHolder} onChange={e => setBank({ ...bank, accountHolder: e.target.value })} className={field} />
                      </div>
                      <p className="text-xs text-slate-500">A live gateway would send you to your bank&apos;s own sign-in page to approve this. Here the approval is simulated.</p>
                    </>
                  )}

                  {method === "WALLET" && (
                    <>
                      <fieldset>
                        <legend className={labelClass}>Your wallet</legend>
                        <div className="grid grid-cols-3 gap-2" role="radiogroup">
                          {session.wallets.map(w => (
                            <button key={w.code} type="button" role="radio" aria-checked={wallet.walletProvider === w.code} onClick={() => setWallet({ ...wallet, walletProvider: w.code })}
                              className={`rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-colors ${wallet.walletProvider === w.code ? "border-indigo-600 bg-indigo-50/70 text-indigo-900" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                              {w.name}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <div>
                        <label htmlFor="gw-mobile" className={labelClass}>Mobile number</label>
                        <div className="flex gap-2">
                          <input id="gw-mobile" inputMode="numeric" value={wallet.mobileNumber} maxLength={10} placeholder="07XXXXXXXX"
                            onChange={e => { setWallet({ ...wallet, mobileNumber: e.target.value.replace(/\D/g, ""), otp: "" }); setOtpSent(false); }} className={`${field} font-mono tracking-wider`} />
                          <button type="button" onClick={() => setOtpSent(true)} disabled={!wallet.walletProvider || !/^07\d{8}$/.test(wallet.mobileNumber)}
                            className="shrink-0 px-4 rounded-xl text-sm font-bold text-indigo-700 border-2 border-indigo-200 hover:bg-indigo-50 disabled:opacity-50">
                            {otpSent ? "Resend code" : "Send code"}
                          </button>
                        </div>
                      </div>
                      {otpSent && (
                        <div>
                          <label htmlFor="gw-otp" className={labelClass}>6-digit code sent to {wallet.mobileNumber.slice(0, 3)}•••{wallet.mobileNumber.slice(-4)}</label>
                          <input id="gw-otp" inputMode="numeric" autoComplete="one-time-code" value={wallet.otp} maxLength={6} placeholder="••••••"
                            onChange={e => setWallet({ ...wallet, otp: e.target.value.replace(/\D/g, "") })} className={`${field} font-mono text-lg tracking-[0.5em] text-center`} />
                          <p className="mt-1.5 text-xs text-slate-500">Sandbox: no text message is sent. Use the code <span className="font-mono font-bold text-slate-700">{SANDBOX_OTP}</span>.</p>
                        </div>
                      )}
                    </>
                  )}

                  <button type="submit" disabled={!ready || processing}
                    className="w-full py-4 rounded-2xl text-base font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                    <Glyph d={LOCK} className="w-5 h-5" /> Pay {lkr(session.amount)}
                  </button>
                </form>

                {/* Sandbox test data */}
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50">
                  <button type="button" onClick={() => setShowSandbox(v => !v)} aria-expanded={showSandbox} className="w-full px-4 py-3 flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-600">
                    Sandbox test details <span aria-hidden="true">{showSandbox ? "−" : "+"}</span>
                  </button>
                  {showSandbox && (
                    <dl className="px-4 pb-4 text-xs text-slate-600 space-y-2">
                      <div><dt className="font-bold text-slate-800">Card (any future expiry, any CVC)</dt><dd className="font-mono">4242 4242 4242 4242 approved · 4000 0000 0000 0002 declined · 4000 0000 0000 9995 no funds</dd></div>
                      <div><dt className="font-bold text-slate-800">Online banking</dt><dd>Any account is approved; one ending <span className="font-mono">0000</span> is rejected, <span className="font-mono">9995</span> has no funds.</dd></div>
                      <div><dt className="font-bold text-slate-800">Mobile wallet</dt><dd>Code <span className="font-mono">{SANDBOX_OTP}</span> is approved; a number ending <span className="font-mono">000</span> has no balance.</dd></div>
                    </dl>
                  )}
                </div>

                {/* Processing overlay */}
                {processing && (
                  <div className="absolute inset-0 bg-white/85 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6" role="status" aria-live="polite">
                    <span className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" aria-hidden="true" />
                    <p className="mt-5 font-black text-slate-900">Processing your payment…</p>
                    <p className="mt-1 text-sm text-slate-500">Please don&apos;t close or refresh this page.</p>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>

      <footer className="px-4 pb-8 text-center text-xs text-slate-500">
        <p>{GATEWAY} is a demonstration gateway built into this project. No real money moves, and card, account and code details are never stored.</p>
      </footer>
    </div>
  );
}

// Result screen for a finished session.
function Result({ session }: { session: Session }) {
  const paid = session.status === "PAID";
  const [receiptError, setReceiptError] = useState("");
  const title = paid ? "Payment successful"
    : session.status === "CANCELLED" ? "Payment cancelled"
    : session.status === "EXPIRED" ? "This payment page has expired"
    : "Payment failed";
  const message = paid ? `${lkr(session.amount)} was paid to ${session.merchant}.`
    : session.status === "CANCELLED" ? "You cancelled the payment. Nothing was charged."
    : session.status === "EXPIRED" ? "The checkout timed out before a payment was made. Nothing was charged."
    : session.lastError || "The payment could not be completed. Nothing was charged.";

  const receipt = async () => {
    setReceiptError("");
    try {
      await downloadReceipt(session.invoiceId, session.invoiceNumber);
    } catch (err) {
      setReceiptError(errText(err, "Couldn't download the receipt."));
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-900/10 p-8 text-center nav-fade-up">
      <span className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${paid ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
        <Glyph d={paid ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} className="w-8 h-8" />
      </span>
      <h1 className="mt-5 text-2xl font-black text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{message}</p>

      <dl className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-left space-y-2">
        <div className="flex justify-between gap-4"><dt className="text-slate-500">Invoice</dt><dd className="font-mono font-bold text-slate-900">{session.invoiceNumber}</dd></div>
        {paid && (
          <>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Amount paid</dt><dd className="font-black tabular-nums text-slate-900">{lkr(session.amount)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500 shrink-0">Paid with</dt><dd className="font-bold text-slate-900 text-right">{session.methodLabel}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Receipt</dt><dd className="font-mono font-bold text-slate-900">{session.receiptNumber}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Gateway reference</dt><dd className="font-mono font-bold text-slate-900">{session.reference}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Paid at</dt><dd className="font-bold text-slate-900">{fmtWhen(session.completedAt)}</dd></div>
          </>
        )}
      </dl>

      {receiptError && <p role="alert" className="mt-3 text-sm font-bold text-red-600">{receiptError}</p>}
      <div className="mt-6 flex flex-col gap-2">
        <Link href={RETURN_URL} className="py-3.5 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700">Return to Lanka Auto Care</Link>
        {paid && <button onClick={receipt} className="py-2.5 text-sm font-bold text-indigo-700 hover:text-indigo-900">Download receipt (PDF)</button>}
      </div>
    </div>
  );
}
