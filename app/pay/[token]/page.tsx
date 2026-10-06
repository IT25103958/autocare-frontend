"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../../utils/axiosInstance";
import { downloadReceipt, errText, fmtWhen, lkr } from "../../billing/_components/billing";
import { shake } from "../../_components/AuthUI";
import {
  type CardBrand, accountNumberProblem, cardBrand, cardNumberProblem, cvcLength, cvcProblem, digitsOf, expiryProblem,
  holderNameProblem, maxCardLength, mobileProblem, otpProblem,
} from "../../../utils/paymentRules";

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

// Picked before the number is typed; each has its own look, length and code size.
const CARD_TYPES: { code: Exclude<CardBrand, "">; label: string; logo: string }[] = [
  { code: "VISA", label: "Visa", logo: "bg-gradient-to-br from-blue-700 to-indigo-800" },
  { code: "MASTERCARD", label: "Mastercard", logo: "bg-gradient-to-br from-orange-500 to-rose-600" },
  { code: "AMEX", label: "Amex", logo: "bg-gradient-to-br from-teal-500 to-cyan-700" },
];
const CARD_PLACEHOLDER: Record<string, string> = { VISA: "•••• •••• •••• ••••", MASTERCARD: "•••• •••• •••• ••••", AMEX: "•••• •••••• •••••" };

const ACCOUNT_TYPES = [
  { code: "SAVINGS", label: "Savings", hint: "Personal savings account" },
  { code: "CURRENT", label: "Current", hint: "Cheque / business account" },
];

const LOCK = "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z";

const Glyph = ({ d, className = "w-5 h-5" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const labelClass = "block text-xs font-bold text-slate-700 mb-1.5";

// Groups the digits as typed: 4-6-5 for Amex, fours otherwise.
const formatCard = (v: string, max: number) => {
  const d = v.replace(/\D/g, "").slice(0, max);
  if (cardBrand(d) === "AMEX") return [d.slice(0, 4), d.slice(4, 10), d.slice(10)].filter(Boolean).join(" ");
  return d.replace(/(\d{4})(?=\d)/g, "$1 ");
};
const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
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

  const [card, setCard] = useState<{ cardType: CardBrand; cardNumber: string; expiry: string; cvc: string; cardholderName: string }>(
    { cardType: "", cardNumber: "", expiry: "", cvc: "", cardholderName: "" });
  const [bank, setBank] = useState({ bankCode: "", accountType: "", accountNumber: "", accountHolder: "" });
  // The account number opens once the bank and account type are chosen.
  const accountReady = !!bank.bankCode && !!bank.accountType;
  const [wallet, setWallet] = useState({ walletProvider: "", mobileNumber: "", otp: "" });
  const [otpSent, setOtpSent] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);
  // Fields the customer has left (blur) and whether Pay was pressed: until
  // then a half-typed value isn't called wrong.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [cvcFocused, setCvcFocused] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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

  const cardDigits = digitsOf(card.cardNumber);
  // The chosen card type decides the length, code size and look; until one is
  // chosen, whatever the digits suggest.
  const brand: CardBrand = card.cardType || cardBrand(cardDigits);
  const chooseCardType = (t: Exclude<CardBrand, "">) => setCard(c => ({
    ...c, cardType: t,
    cardNumber: formatCard(c.cardNumber, maxCardLength(t)),
    cvc: c.cvc.slice(0, cvcLength(t)),
  }));

  // Every field's problem right now (null = fine), and when it's fair to show it.
  const checks: Record<string, { problem: string | null; value: string; obvious: boolean }> = method === "CARD" ? {
    cardType: { problem: card.cardType ? null : "Choose your card type first.", value: card.cardType, obvious: false },
    cardNumber: {
      problem: card.cardType ? cardNumberProblem(card.cardNumber, card.cardType) : "Choose your card type first.", value: cardDigits,
      // Shown while typing once the number is full length, can't be any card we
      // take, or is clearly a different type from the one chosen.
      obvious: cardDigits.length >= maxCardLength(brand) || (cardDigits.length > 0 && !"2345".includes(cardDigits[0]))
        || (cardDigits.length >= 4 && cardBrand(cardDigits) !== card.cardType),
    },
    expiry: { problem: expiryProblem(card.expiry), value: card.expiry, obvious: card.expiry.length === 5 || Number(card.expiry.slice(0, 2)) > 12 },
    cvc: { problem: cvcProblem(card.cvc, brand), value: card.cvc, obvious: card.cvc.length >= cvcLength(brand) },
    cardholderName: { problem: holderNameProblem(card.cardholderName, "card"), value: card.cardholderName, obvious: /[^\p{L} .'-]/u.test(card.cardholderName) },
  } : method === "BANK" ? {
    bankCode: { problem: bank.bankCode ? null : "Choose your bank.", value: bank.bankCode, obvious: false },
    accountType: { problem: bank.accountType ? null : "Choose the account type.", value: bank.accountType, obvious: false },
    accountNumber: { problem: accountNumberProblem(bank.accountNumber), value: bank.accountNumber, obvious: bank.accountNumber.length >= 16 },
    accountHolder: { problem: holderNameProblem(bank.accountHolder, "account"), value: bank.accountHolder, obvious: /[^\p{L} .'-]/u.test(bank.accountHolder) },
  } : {
    walletProvider: { problem: wallet.walletProvider ? null : "Choose your wallet.", value: wallet.walletProvider, obvious: false },
    mobileNumber: { problem: mobileProblem(wallet.mobileNumber), value: wallet.mobileNumber, obvious: wallet.mobileNumber.length >= 10 || (wallet.mobileNumber.length >= 2 && !wallet.mobileNumber.startsWith("07")) || (wallet.mobileNumber.length >= 3 && !/^07[0-24-8]/.test(wallet.mobileNumber)) },
    otp: { problem: !otpSent ? "Press “Send code” first." : otpProblem(wallet.otp), value: wallet.otp, obvious: false },
  };

  const shown = (name: string) => {
    const c = checks[name];
    return !!c.problem && (submitted || touched[name] || (c.value !== "" && c.obvious));
  };
  const statusOf = (name: string): PayStatus => (shown(name) ? "error" : checks[name].value && !checks[name].problem ? "valid" : "idle");
  const noteOf = (name: string) => (shown(name) ? checks[name].problem : null);
  const blur = (name: string) => () => setTouched(t => ({ ...t, [name]: true }));

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setSubmitted(true);
    const firstBad = Object.keys(checks).find(k => checks[k].problem);
    if (firstBad) {
      shake(formRef.current);
      formRef.current?.querySelector<HTMLElement>(`[data-field="${firstBad}"]`)?.focus();
      return;
    }
    setProcessing(true);
    setFormError("");
    try {
      const body = method === "CARD" ? card : method === "BANK" ? bank : wallet;
      const [res] = await Promise.all([api.post<Session>(`/gateway/sessions/${token}/pay`, { method, ...body }), pause(1600)]);
      accept(res.data);
      if (res.data.status === "PENDING") { setWallet(w => ({ ...w, otp: "" })); shake(formRef.current); }
    } catch (err) {
      setFormError(errText(err, "The payment couldn't be processed. Please try again."));
      shake(formRef.current);
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
    setSubmitted(false);
    setTouched({});
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Gateway header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center">
              <Glyph d={LOCK} className="w-4 h-4" />
            </span>
            <span className="text-lg font-black tracking-tight text-slate-900">Pay<span className="text-indigo-600">Bridge</span></span>
            <span className="ml-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest">Sandbox</span>
          </div>
          <p className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-slate-500"><Glyph d={LOCK} className="w-4 h-4 text-emerald-600" /> Secure checkout</p>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 sm:py-6">
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
            <div className="pay-in grid lg:grid-cols-[1fr_1.25fr] rounded-3xl overflow-hidden shadow-2xl shadow-slate-900/10 bg-white border border-slate-200">
              {/* Order summary + live preview of what's being typed */}
              <aside className="relative bg-[#0a1430] text-white p-6 sm:p-8 flex flex-col overflow-hidden">
                <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-indigo-600/30 blur-3xl" aria-hidden="true" />
                <div className="relative">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-200">Paying {session.merchant}</p>
                  <p className="mt-2 text-4xl font-black tracking-tight tabular-nums">{lkr(session.amount)}</p>
                  <dl className="mt-5 space-y-2 text-sm border-t border-white/10 pt-4">
                    <div className="flex justify-between gap-4"><dt className="text-slate-300">Invoice</dt><dd className="font-mono font-bold">{session.invoiceNumber}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-slate-300 shrink-0">For</dt><dd className="font-bold text-right">{session.description}</dd></div>
                    {session.pointsToRedeem > 0 && (
                      <div className="flex justify-between gap-4"><dt className="text-slate-300">Loyalty points</dt><dd className="font-bold">{session.pointsToRedeem.toLocaleString()} applied on payment</dd></div>
                    )}
                  </dl>
                </div>

                <div className="relative mt-6">
                  {method === "CARD" && <CardPreview card={card} brand={brand} flipped={cvcFocused} />}
                  {method === "BANK" && <BankPreview bank={bank} banks={session.banks} />}
                  {method === "WALLET" && <WalletPreview wallet={wallet} wallets={session.wallets} />}
                </div>

                <div className="relative mt-auto pt-6">
                  <div className={`rounded-2xl px-4 py-2.5 flex items-center justify-between ${secondsLeft <= 60 ? "bg-rose-500/20 text-rose-100" : "bg-white/10 text-slate-200"}`}>
                    <span className="text-xs font-bold">This page expires in</span>
                    <span className="text-lg font-black tabular-nums" role="timer">{clock(secondsLeft)}</span>
                  </div>
                  <button type="button" onClick={cancel} disabled={processing} className="mt-3 text-sm font-bold text-slate-300 hover:text-white disabled:opacity-50">
                    ← Cancel and return to Lanka Auto Care
                  </button>
                </div>
              </aside>

              {/* Payment methods */}
              <section className="relative p-6 sm:p-8">
                <h1 className="text-lg font-black text-slate-900">How would you like to pay?</h1>

                <div className="mt-3 grid grid-cols-3 gap-2" role="tablist" aria-label="Payment method">
                  {METHODS.map(m => (
                    <button key={m.key} type="button" role="tab" aria-selected={method === m.key} onClick={() => chooseMethod(m.key)}
                      className={`rounded-xl border-2 px-3 py-2 text-left transition-all ${method === m.key ? "border-indigo-600 bg-indigo-50/70 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}>
                      <span className="flex items-center gap-2">
                        <Glyph d={m.icon} className={`w-5 h-5 shrink-0 ${method === m.key ? "text-indigo-600" : "text-slate-500"}`} />
                        <span className="text-sm font-black text-slate-900">{m.label}</span>
                      </span>
                      <span className="hidden xl:block mt-0.5 text-[11px] text-slate-500">{m.hint}</span>
                    </button>
                  ))}
                </div>

                {session.lastError && !formError && (
                  <div role="alert" className="pay-msg-in mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
                    <p className="text-sm font-bold text-red-700">{session.lastError}</p>
                    <p className="text-xs text-red-700/80 mt-0.5">{session.attemptsLeft} attempt{session.attemptsLeft === 1 ? "" : "s"} left. You have not been charged.</p>
                  </div>
                )}
                {formError && <p role="alert" className="pay-msg-in mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700">{formError}</p>}

                <form ref={formRef} onSubmit={pay} noValidate className="mt-4 space-y-3.5">
                  {method === "CARD" && (
                    <>
                      <fieldset>
                        <legend className={labelClass}>Card type</legend>
                        <div className="grid grid-cols-3 gap-2" role="radiogroup">
                          {CARD_TYPES.map((t, i) => {
                            const active = card.cardType === t.code;
                            return (
                              <button key={t.code} type="button" role="radio" aria-checked={active} data-field={i === 0 ? "cardType" : undefined}
                                onClick={() => chooseCardType(t.code)}
                                className={`rounded-xl border-2 px-2.5 py-2 text-left transition-all ${active ? "border-indigo-600 bg-indigo-50/70 shadow-sm -translate-y-0.5" : shown("cardType") ? "border-red-300" : "border-slate-200 hover:border-slate-300"}`}>
                                <span className="flex items-center gap-2">
                                  <span className={`w-8 h-5 shrink-0 rounded ${t.logo} text-white text-[7px] font-black italic flex items-center justify-center transition-transform ${active ? "scale-110" : ""}`}>{t.code === "MASTERCARD" ? "MC" : t.code}</span>
                                  <span className="text-sm font-black text-slate-900">{t.label}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <FieldNote note={noteOf("cardType")} />
                      </fieldset>
                      <PayField id="gw-number" field="cardNumber" label="Card number" inputMode="numeric" autoComplete="cc-number"
                        disabled={!card.cardType}
                        value={card.cardNumber} placeholder={card.cardType ? CARD_PLACEHOLDER[card.cardType] : "Choose the card type first"} mono
                        onChange={v => setCard({ ...card, cardNumber: formatCard(v, maxCardLength(brand)) })} onBlur={blur("cardNumber")}
                        status={statusOf("cardNumber")} note={card.cardType ? noteOf("cardNumber") : null} />
                      <div className="grid grid-cols-2 gap-3">
                        <PayField id="gw-exp" field="expiry" label="Expiry" inputMode="numeric" autoComplete="cc-exp" value={card.expiry} placeholder="MM/YY" mono
                          onChange={v => setCard({ ...card, expiry: formatExpiry(v) })} onBlur={blur("expiry")}
                          status={statusOf("expiry")} note={noteOf("expiry")} />
                        <PayField id="gw-cvc" field="cvc" label="Security code" inputMode="numeric" autoComplete="cc-csc" value={card.cvc}
                          placeholder={brand === "AMEX" ? "4 digits" : "3 digits"} mono maxLength={cvcLength(brand)}
                          onChange={v => setCard({ ...card, cvc: v.replace(/\D/g, "").slice(0, cvcLength(brand)) })}
                          onFocus={() => setCvcFocused(true)} onBlur={() => { setCvcFocused(false); blur("cvc")(); }}
                          status={statusOf("cvc")} note={noteOf("cvc")} />
                      </div>
                      <PayField id="gw-name" field="cardholderName" label="Name on card" autoComplete="cc-name" value={card.cardholderName} maxLength={50}
                        placeholder="As printed on the card" onChange={v => setCard({ ...card, cardholderName: v })} onBlur={blur("cardholderName")}
                        status={statusOf("cardholderName")} note={noteOf("cardholderName")} />
                    </>
                  )}

                  {method === "BANK" && (
                    <>
                      <fieldset>
                        <legend className={labelClass}>Your bank</legend>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup">
                          {session.banks.map((b, i) => (
                            <button key={b.code} type="button" role="radio" aria-checked={bank.bankCode === b.code} data-field={i === 0 ? "bankCode" : undefined}
                              onClick={() => setBank({ ...bank, bankCode: b.code })}
                              className={`rounded-xl border-2 px-3 py-2 text-left text-xs font-bold transition-colors ${bank.bankCode === b.code ? "border-indigo-600 bg-indigo-50/70 text-indigo-900" : shown("bankCode") ? "border-red-300 text-slate-700" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                              {b.name}
                            </button>
                          ))}
                        </div>
                        <FieldNote note={noteOf("bankCode")} />
                      </fieldset>
                      <fieldset className="pay-msg-in">
                        <legend className={labelClass}>Account type</legend>
                        <div className="grid grid-cols-2 gap-2" role="radiogroup">
                          {ACCOUNT_TYPES.map((t, i) => (
                            <button key={t.code} type="button" role="radio" aria-checked={bank.accountType === t.code} data-field={i === 0 ? "accountType" : undefined}
                              onClick={() => setBank({ ...bank, accountType: t.code })}
                              className={`rounded-xl border-2 px-3 py-2 text-left transition-colors ${bank.accountType === t.code ? "border-indigo-600 bg-indigo-50/70 text-indigo-900" : shown("accountType") ? "border-red-300 text-slate-700" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                              <span className="block text-sm font-bold">{t.label}</span>
                              <span className="block text-[11px] text-slate-500">{t.hint}</span>
                            </button>
                          ))}
                        </div>
                        <FieldNote note={noteOf("accountType")} />
                      </fieldset>
                      <PayField id="gw-account" field="accountNumber" label="Account number" inputMode="numeric" value={bank.accountNumber} maxLength={16}
                        disabled={!accountReady}
                        placeholder={accountReady ? "8 to 16 digits" : !bank.bankCode ? "Choose your bank first" : "Choose the account type first"}
                        mono counter={`${bank.accountNumber.length}/16`}
                        onChange={v => setBank({ ...bank, accountNumber: v.replace(/\D/g, "").slice(0, 16) })} onBlur={blur("accountNumber")}
                        status={statusOf("accountNumber")} note={noteOf("accountNumber")} />
                      <PayField id="gw-holder" field="accountHolder" label="Account holder" value={bank.accountHolder} maxLength={50}
                        placeholder="As shown on your passbook" onChange={v => setBank({ ...bank, accountHolder: v })} onBlur={blur("accountHolder")}
                        status={statusOf("accountHolder")} note={noteOf("accountHolder")} />
                      <p className="text-xs text-slate-500">A live gateway would send you to your bank&apos;s own sign-in page to approve this. Here the approval is simulated.</p>
                    </>
                  )}

                  {method === "WALLET" && (
                    <>
                      <fieldset>
                        <legend className={labelClass}>Your wallet</legend>
                        <div className="grid grid-cols-3 gap-2" role="radiogroup">
                          {session.wallets.map((w, i) => (
                            <button key={w.code} type="button" role="radio" aria-checked={wallet.walletProvider === w.code} data-field={i === 0 ? "walletProvider" : undefined}
                              onClick={() => setWallet({ ...wallet, walletProvider: w.code })}
                              className={`rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors ${wallet.walletProvider === w.code ? "border-indigo-600 bg-indigo-50/70 text-indigo-900" : shown("walletProvider") ? "border-red-300 text-slate-700" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                              {w.name}
                            </button>
                          ))}
                        </div>
                        <FieldNote note={noteOf("walletProvider")} />
                      </fieldset>
                      <PayField id="gw-mobile" field="mobileNumber" label="Mobile number" inputMode="numeric" value={wallet.mobileNumber} maxLength={10}
                        placeholder="07XXXXXXXX" mono
                        onChange={v => { setWallet({ ...wallet, mobileNumber: v.replace(/\D/g, "").slice(0, 10), otp: "" }); setOtpSent(false); }} onBlur={blur("mobileNumber")}
                        status={statusOf("mobileNumber")} note={noteOf("mobileNumber")}
                        action={
                          <button type="button" onClick={() => setOtpSent(true)} disabled={!wallet.walletProvider || !!mobileProblem(wallet.mobileNumber)}
                            className="shrink-0 px-4 rounded-xl text-sm font-bold text-indigo-700 border-2 border-indigo-200 hover:bg-indigo-50 disabled:opacity-50">
                            {otpSent ? "Resend" : "Send code"}
                          </button>
                        } />
                      {otpSent ? (
                        <div className="pay-msg-in">
                          <PayField id="gw-otp" field="otp" label={`6-digit code sent to ${wallet.mobileNumber.slice(0, 3)}•••${wallet.mobileNumber.slice(-4)}`}
                            inputMode="numeric" autoComplete="one-time-code" value={wallet.otp} maxLength={6} placeholder="••••••" mono center
                            onChange={v => setWallet({ ...wallet, otp: v.replace(/\D/g, "").slice(0, 6) })} onBlur={blur("otp")}
                            status={statusOf("otp")} note={noteOf("otp")} />
                          <p className="mt-1 text-xs text-slate-500">Sandbox: no text message is sent. Use the code <span className="font-mono font-bold text-slate-700">{SANDBOX_OTP}</span>.</p>
                        </div>
                      ) : (
                        <FieldNote note={noteOf("otp")} />
                      )}
                    </>
                  )}

                  <button type="submit" disabled={processing}
                    className="group relative overflow-hidden w-full py-3.5 rounded-2xl text-base font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                    <span className="home-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" aria-hidden="true" />
                    <Glyph d={LOCK} className="relative w-5 h-5" /> <span className="relative">Pay {lkr(session.amount)}</span>
                  </button>
                </form>

                {/* Sandbox test data */}
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50">
                  <button type="button" onClick={() => setShowSandbox(v => !v)} aria-expanded={showSandbox} className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-600">
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

      <footer className="px-4 pb-5 text-center text-xs text-slate-500">
        <p>{GATEWAY} is a demonstration gateway built into this project. No real money moves, and card, account and code details are never stored.</p>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

type PayStatus = "idle" | "error" | "valid";

// The message under a field; slides open and closed instead of making the form jump.
function FieldNote({ note }: { note: string | null }) {
  return (
    <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${note ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
      <div className="overflow-hidden">
        {note && (
          <p key={note} role="alert" className="pay-msg-in mt-1.5 flex items-start gap-1.5 text-xs font-bold text-red-600">
            <Glyph d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5 mt-px shrink-0" /> {note}
          </p>
        )}
      </div>
    </div>
  );
}

function PayField({ id, field, label, value, onChange, status, note, mono, center, badge, counter, action, ...input }: {
  id: string; field: string; label: string; value: string; onChange: (v: string) => void;
  status: PayStatus; note: string | null; mono?: boolean; center?: boolean;
  badge?: React.ReactNode; counter?: string; action?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange" | "className">) {
  const border = status === "error" ? "border-red-400 bg-red-50/40 focus-within:ring-red-500/15"
    : status === "valid" ? "border-emerald-400 focus-within:ring-emerald-500/15"
    : "border-slate-300 focus-within:border-indigo-500 focus-within:ring-indigo-500/15";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label htmlFor={id} className={labelClass.replace(" mb-1.5", "")}>{label}</label>
        {counter && <span className="text-[11px] font-bold tabular-nums text-slate-400">{counter}</span>}
      </div>
      <div className="flex gap-2">
        <div className={`flex-1 flex items-center rounded-xl border bg-white transition-all duration-300 focus-within:ring-4 has-[:disabled]:bg-slate-50 has-[:disabled]:border-dashed ${border}`}>
          <input {...input} id={id} data-field={field} value={value} onChange={e => onChange(e.target.value)}
            aria-invalid={status === "error"} aria-describedby={note ? `${id}-note` : undefined}
            className={`w-full min-w-0 bg-transparent px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none disabled:cursor-not-allowed disabled:placeholder:text-slate-300 ${mono ? "font-mono tracking-wider" : ""} ${center ? "text-center text-lg tracking-[0.5em]" : ""}`} />
          <span className="pr-3 flex items-center gap-2 shrink-0">
            {badge}
            {status === "valid" && <span key="ok" className="auth-pop text-emerald-500"><Glyph d="M5 13l4 4L19 7" className="w-[18px] h-[18px]" /></span>}
            {status === "error" && <span key="bad" className="auth-pop text-red-500"><Glyph d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" className="w-[18px] h-[18px]" /></span>}
          </span>
        </div>
        {action}
      </div>
      <div id={`${id}-note`}><FieldNote note={note} /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live previews (left panel)
// ---------------------------------------------------------------------------

// Shows the number grouped as it will print: 4-6-5 for Amex, 4-4-4-4 otherwise.
function cardFace(digits: string, brand: CardBrand) {
  const total = maxCardLength(brand) === 19 ? 16 : maxCardLength(brand);
  const padded = (digits + "•".repeat(Math.max(0, total - digits.length))).slice(0, Math.max(total, digits.length));
  if (brand === "AMEX") return `${padded.slice(0, 4)} ${padded.slice(4, 10)} ${padded.slice(10)}`;
  return padded.replace(/(.{4})(?=.)/g, "$1 ");
}

function CardPreview({ card, brand, flipped }: { card: { cardNumber: string; expiry: string; cvc: string; cardholderName: string }; brand: CardBrand; flipped: boolean }) {
  const digits = digitsOf(card.cardNumber);
  const tone = brand === "VISA" ? "from-blue-700 via-indigo-800 to-slate-900"
    : brand === "MASTERCARD" ? "from-orange-600 via-rose-700 to-slate-900"
    : brand === "AMEX" ? "from-teal-600 via-cyan-800 to-slate-900"
    : "from-slate-700 via-slate-800 to-indigo-950";
  return (
    <div className="[perspective:1000px]" aria-hidden="true">
      <div className={`relative h-44 transition-transform duration-700 [transform-style:preserve-3d] ${flipped ? "[transform:rotateY(180deg)]" : ""}`}>
        {/* Front */}
        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${tone} p-5 shadow-2xl shadow-black/40 ring-1 ring-white/15 [backface-visibility:hidden] transition-colors duration-500 overflow-hidden`}>
          <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent home-sweep" />
          <div className="relative flex items-center justify-between">
            <span className="w-10 h-7 rounded-md bg-gradient-to-br from-amber-200 to-amber-400" />
            <span key={brand} className="pay-msg-in text-sm font-black italic tracking-wider">{brand || "CARD"}</span>
          </div>
          <p className="relative mt-6 font-mono text-lg tracking-[0.15em] whitespace-nowrap">{cardFace(digits, brand)}</p>
          <div className="relative mt-4 flex justify-between text-xs">
            <span className="uppercase tracking-wider truncate max-w-[65%]">{card.cardholderName || "Name on card"}</span>
            <span className="font-mono">{card.expiry || "MM/YY"}</span>
          </div>
        </div>
        {/* Back: shown while the security code is typed */}
        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${tone} shadow-2xl shadow-black/40 ring-1 ring-white/15 [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-hidden`}>
          <div className="mt-6 h-9 bg-black/70" />
          <div className="mx-5 mt-5 flex items-center gap-3">
            <div className="flex-1 h-8 rounded bg-white/85" />
            <span className="w-14 h-8 rounded bg-white text-slate-900 font-mono text-sm font-black flex items-center justify-center tracking-widest">{card.cvc || "•••"}</span>
          </div>
          <p className="mx-5 mt-3 text-[10px] text-white/70">{brand === "AMEX" ? "Amex: the 4-digit code is on the front." : "The 3-digit code next to the signature strip."}</p>
        </div>
      </div>
    </div>
  );
}

function BankPreview({ bank, banks }: { bank: { bankCode: string; accountType: string; accountNumber: string; accountHolder: string }; banks: Option[] }) {
  const name = banks.find(b => b.code === bank.bankCode)?.name;
  const type = ACCOUNT_TYPES.find(t => t.code === bank.accountType)?.label;
  return (
    <div className="rounded-2xl bg-white/10 ring-1 ring-white/15 p-5" aria-hidden="true">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><Glyph d={METHODS[1].icon} className="w-5 h-5" /></span>
        <span>
          <span key={name} className="pay-msg-in block font-black">{name ?? "Choose your bank"}</span>
          {type && <span key={type} className="pay-msg-in block text-[11px] font-bold uppercase tracking-widest text-indigo-200">{type} account</span>}
        </span>
      </div>
      <p className="mt-5 font-mono text-lg tracking-[0.15em]">{bank.accountNumber ? bank.accountNumber.replace(/(.{4})(?=.)/g, "$1 ") : "•••• •••• ••••"}</p>
      <p className="mt-2 text-xs uppercase tracking-wider text-slate-300 truncate">{bank.accountHolder || "Account holder"}</p>
    </div>
  );
}

function WalletPreview({ wallet, wallets }: { wallet: { walletProvider: string; mobileNumber: string; otp: string }; wallets: Option[] }) {
  const name = wallets.find(w => w.code === wallet.walletProvider)?.name;
  return (
    <div className="mx-auto w-44 rounded-[1.75rem] bg-slate-900 p-2 ring-1 ring-white/15 shadow-2xl" aria-hidden="true">
      <div className="rounded-[1.4rem] bg-gradient-to-b from-indigo-600 to-violet-700 px-4 py-5 text-center">
        <p key={name} className="pay-msg-in text-xs font-black uppercase tracking-widest">{name ?? "Wallet"}</p>
        <p className="mt-3 font-mono text-sm">{wallet.mobileNumber || "07X XXX XXXX"}</p>
        <div className="mt-3 flex justify-center gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={`w-4 h-5 rounded text-[11px] font-black flex items-center justify-center ${wallet.otp[i] ? "bg-white text-indigo-700" : "bg-white/20"}`}>{wallet.otp[i] ?? ""}</span>
          ))}
        </div>
      </div>
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
