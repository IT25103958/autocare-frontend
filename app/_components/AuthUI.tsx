"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import SmartImage from "./SmartImage";

// ---------------------------------------------------------------------------
// Shared pieces of the sign-in and sign-up pages: the dark page frame with the
// workshop photo, the box with the running border light, and an input that
// shows its problem as you type.
// ---------------------------------------------------------------------------

const PATHS = {
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  at: "M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  mail: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  shield: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  eyeOff: "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21",
  check: "M5 13l4 4L19 7",
  x: "M6 18L18 6M6 6l12 12",
  alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  wrench: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  fuel: "M3 21V5a2 2 0 012-2h7a2 2 0 012 2v16M3 21h11M6 8h5M14 10h2a2 2 0 012 2v4a1.5 1.5 0 003 0V8.5L18 5",
  car: "M5 13l1.5-4.5A2 2 0 018.4 7h7.2a2 2 0 011.9 1.5L19 13M5 13h14M5 13v4a1 1 0 001 1h1a1 1 0 001-1v-1h8v1a1 1 0 001 1h1a1 1 0 001-1v-4M7.5 15.5h.01M16.5 15.5h.01",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
};
export type AuthIconName = keyof typeof PATHS;

export function AuthIcon({ name, className = "w-5 h-5" }: { name: AuthIconName; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={PATHS[name]} />
    </svg>
  );
}

export function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// Shakes an element sideways, e.g. the form after a failed submit.
export function shake(el: HTMLElement | null) {
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-10px)" }, { transform: "translateX(9px)" },
     { transform: "translateX(-6px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }],
    { duration: 420, easing: "ease-in-out" },
  );
}

// ---------------------------------------------------------------------------
// Photo side: the workshop picture with live "service" and "fuel" cards on it
// ---------------------------------------------------------------------------

// Counts up once, e.g. litres pumped on the fuel card.
function CountUp({ to, decimals = 0, delay = 0, duration = 2400 }: { to: number; decimals?: number; delay?: number; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const startAt = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - startAt) / duration));
      setValue(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, delay, duration]);
  return <>{value.toFixed(decimals)}</>;
}

// A glass card on the photo: drops in, then floats; moves with the pointer.
function FloatingCard({ delay, depth, floatDelay = "0s", className = "", children }: { delay: number; depth: number; floatDelay?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`hero-layer ${className}`} style={{ "--depth": `${depth}px` } as React.CSSProperties}>
      <div className="hero-card-in" style={{ animationDelay: `${delay}ms` }}>
        <div className="home-float rounded-2xl border border-white/10 bg-zinc-950/55 backdrop-blur-md p-4 shadow-2xl shadow-black/50" style={{ animationDelay: floatDelay }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function FuelGauge() {
  return (
    <svg viewBox="0 0 100 60" className="w-24 h-auto" aria-hidden="true">
      <defs>
        <linearGradient id="auth-gauge" x1="0" x2="1">
          <stop offset="0" stopColor="#ef4444" /><stop offset="0.45" stopColor="#f59e0b" /><stop offset="1" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" strokeLinecap="round" />
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="url(#auth-gauge)" strokeWidth="8" strokeLinecap="round" />
      <text x="6" y="60" fill="#a1a1aa" fontSize="8" fontWeight="700">E</text>
      <text x="88" y="60" fill="#a1a1aa" fontSize="8" fontWeight="700">F</text>
      <g className="auth-needle">
        <line x1="50" y1="50" x2="50" y2="16" stroke="white" strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="50" cy="50" r="5" fill="white" />
    </svg>
  );
}

const SERVICE_STEPS = ["Inspection", "Oil & filter", "Brake check"];

function PhotoPanel({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub: string }) {
  return (
    <div className="auth-photo-in relative hidden lg:block lg:w-[52%] overflow-hidden">
      <div className="absolute inset-0 auth-kenburns">
        <SmartImage src="/images/auth-theme.jpg" alt="" eager className="w-full h-full object-cover object-[65%_center] saturate-[1.1]" />
      </div>
      {/* Fade the photo into the dark page, like a vignette from the form side */}
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/55 to-zinc-950/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-zinc-950/60" />
      <div className="absolute inset-0 mix-blend-color bg-gradient-to-br from-blue-900/40 via-transparent to-amber-700/30" />
      {/* A lane marking running down the right edge */}
      <div className="absolute right-10 top-0 bottom-0 w-1 auth-road opacity-30 [mask-image:linear-gradient(to_bottom,transparent,black_30%,black_70%,transparent)]" />

      <div className="relative z-10 h-full flex flex-col justify-end p-10 xl:p-14">
        {/* Service and fuel at a glance */}
        <div className="relative h-56 mb-8">
          <FloatingCard delay={700} depth={-20} className="absolute top-0 right-6 w-64">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center"><AuthIcon name="wrench" className="w-5 h-5" /></span>
              <div>
                <div className="text-sm font-bold text-white">Full service · CBA-1234</div>
                <div className="text-[11px] text-zinc-400">Bay 2 · in progress</div>
              </div>
            </div>
            <ul className="space-y-1.5">
              {SERVICE_STEPS.map((step, i) => (
                <li key={step} className="flex items-center gap-2 text-xs text-zinc-300">
                  {i < 2 ? (
                    <span className="auth-pop w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center" style={{ animationDelay: `${1300 + i * 350}ms` }}>
                      <AuthIcon name="check" className="w-3 h-3" />
                    </span>
                  ) : (
                    <Spinner className="w-4 h-4 text-amber-400" />
                  )}
                  {step}
                </li>
              ))}
            </ul>
          </FloatingCard>

          <FloatingCard delay={950} depth={32} floatDelay="-3s" className="absolute bottom-0 left-0 w-[17rem]">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-300 whitespace-nowrap">
                  <AuthIcon name="fuel" className="w-3.5 h-3.5" /> Pump 3 · Petrol 92
                </div>
                <div className="mt-1 text-2xl font-black text-white tabular-nums"><CountUp to={32.5} decimals={1} delay={900} /> L</div>
                <div className="text-[11px] text-zinc-400">National Fuel Pass accepted</div>
              </div>
              <FuelGauge />
            </div>
          </FloatingCard>
        </div>

        <p className="hero-fade-up inline-flex self-start items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-200" style={{ animationDelay: "300ms" }}>
          <span className="relative flex w-2 h-2"><span className="home-ping absolute inset-0 rounded-full bg-amber-400" /><span className="relative w-2 h-2 rounded-full bg-amber-400" /></span>
          {eyebrow}
        </p>
        <h2 className="mt-4 text-4xl xl:text-5xl font-black leading-[1.05] tracking-tight text-white">
          <span className="hero-line"><span style={{ animationDelay: "450ms" }}>{title}</span></span>
        </h2>
        <p className="hero-fade-up mt-4 max-w-md text-zinc-300 font-medium" style={{ animationDelay: "700ms" }}>{sub}</p>
        <div className="hero-fade-up mt-6 flex flex-wrap gap-2" style={{ animationDelay: "850ms" }}>
          {([["car", "Vehicle servicing"], ["fuel", "24-hour fuel"], ["calendar", "Online booking"]] as const).map(([icon, text]) => (
            <span key={text} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-zinc-200">
              <AuthIcon name={icon} className="w-4 h-4 text-cyan-300" /> {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page frame
// ---------------------------------------------------------------------------

export function AuthFrame({ eyebrow, title, sub, children }: { eyebrow: string; title: ReactNode; sub: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // Pointer parallax for the photo cards (.hero-layer reads --mx / --my).
  const onPointerMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", (((e.clientX - r.left) / r.width) - 0.5).toFixed(3));
    el.style.setProperty("--my", (((e.clientY - r.top) / r.height) - 0.5).toFixed(3));
  };

  return (
    <div ref={ref} onPointerMove={onPointerMove} className="relative flex min-h-[calc(100vh-73px)] w-full bg-zinc-950 text-zinc-100 overflow-hidden">
      <div className="relative flex-1 flex items-center justify-center px-4 py-8 sm:px-10">
        {/* On small screens the photo sits faintly behind the form instead */}
        <div className="lg:hidden absolute inset-0 opacity-20">
          <SmartImage src="/images/auth-theme.jpg" alt="" eager className="w-full h-full object-cover" />
        </div>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="hero-blob absolute -top-40 -left-32 w-[28rem] h-[28rem] rounded-full bg-blue-600/15 blur-[110px]" />
          <div className="hero-blob absolute -bottom-40 right-0 w-[26rem] h-[26rem] rounded-full bg-amber-500/10 blur-[110px]" style={{ animationDelay: "-6s" }} />
        </div>
        <div className="relative z-10 w-full max-w-[30rem]">{children}</div>
      </div>
      <PhotoPanel eyebrow={eyebrow} title={title} sub={sub} />
    </div>
  );
}

// The form box: arrives with a blur-in and has a light running around its border.
export function AuthBox({ boxRef, children }: { boxRef?: React.Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <div ref={boxRef} className="auth-card-in relative rounded-3xl p-px overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
      <div className="auth-border absolute inset-[-50%]" aria-hidden="true" />
      <div className="relative rounded-[calc(1.5rem-1px)] bg-zinc-950/95 backdrop-blur-xl px-6 py-7 sm:px-9 sm:py-8 ring-1 ring-white/5">
        {children}
      </div>
    </div>
  );
}

// Big heading with the glowing gradient dot, e.g. "Welcome back."
export function AuthTitle({ children, sub }: { children: ReactNode; sub: string }) {
  return (
    <div>
      <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-50 [text-shadow:0_0_24px_rgba(255,255,255,0.25)]">
        {children}
        <span className="auth-glow inline-block ml-1 w-2.5 h-2.5 rounded-full bg-gradient-to-br from-cyan-400 to-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)]" />
      </h1>
      <p className="mt-2 text-sm text-zinc-400 font-medium">{sub}</p>
    </div>
  );
}

// Fades a form row in after the box has arrived.
export function Stagger({ i, children, className = "" }: { i: number; children: ReactNode; className?: string }) {
  return <div className={`hero-fade-up ${className}`} style={{ animationDelay: `${300 + i * 70}ms` }}>{children}</div>;
}

// Gradient button: blue for the workshop, amber for the fuel station.
export function AuthButton({ busy, done, children, busyText, doneText }: { busy: boolean; done?: boolean; children: ReactNode; busyText: string; doneText?: string }) {
  return (
    <button type="submit" disabled={busy || done}
      className={`group relative w-full overflow-hidden flex items-center justify-center gap-2 rounded-xl py-3 px-4 font-bold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-blue-500/30 active:translate-y-0 disabled:hover:translate-y-0 ${
        done ? "bg-emerald-500" : "auth-gradient bg-gradient-to-r from-blue-600 via-cyan-500 to-amber-500 disabled:opacity-70"
      }`}>
      <span className="home-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      {busy && <Spinner className="w-5 h-5" />}
      {done && <span className="auth-pop"><AuthIcon name="check" className="w-5 h-5" /></span>}
      <span className="relative">{done ? doneText : busy ? busyText : children}</span>
      {!busy && !done && <span className="relative transition-transform duration-300 group-hover:translate-x-1">→</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

export type FieldStatus = "idle" | "error" | "valid" | "checking";
export type FieldNote = { tone: "error" | "warn" | "ok" | "hint"; text: ReactNode } | null;

const NOTE_STYLES = {
  error: "text-red-400",
  warn: "text-amber-400",
  ok: "text-emerald-400",
  hint: "text-zinc-400",
};
const NOTE_ICONS: Record<string, AuthIconName> = { error: "x", warn: "alert", ok: "check", hint: "info" };

type FieldProps = Omit<ComponentProps<"input">, "className"> & {
  label: string;
  icon: AuthIconName;
  status?: FieldStatus;
  note?: FieldNote;
  labelExtra?: ReactNode;
  reveal?: boolean; // password fields get a show / hide button
};

export function AuthField({ label, icon, status = "idle", note, labelExtra, reveal, type = "text", id, name, onKeyUp, onBlur, ...input }: FieldProps) {
  const [shown, setShown] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const fieldId = id ?? `f-${name}`;
  const noteId = `${fieldId}-note`;

  // Caps Lock is a common reason a correct-looking password is "wrong".
  const shownNote: FieldNote = note ?? (reveal && capsLock ? { tone: "warn", text: "Caps Lock is on." } : null);

  const border =
    status === "error" ? "border-red-500/70 bg-red-500/[0.06] focus-within:ring-red-500/20"
    : status === "valid" ? "border-emerald-500/60 focus-within:ring-emerald-500/20"
    : "border-white/10 hover:border-white/20 focus-within:border-cyan-400/70 focus-within:ring-cyan-400/15";
  const iconTone =
    status === "error" ? "text-red-400" : status === "valid" ? "text-emerald-400" : "text-zinc-500 group-focus-within:text-cyan-300";

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5 ml-0.5">
        <label htmlFor={fieldId} className="text-[13px] font-semibold text-zinc-300">{label}</label>
        {labelExtra}
      </div>

      <div className={`group relative flex items-center rounded-xl border bg-zinc-900/80 transition-all duration-300 focus-within:ring-4 focus-within:bg-zinc-900 ${border}`}>
        <span className={`pl-3.5 transition-colors duration-300 ${iconTone}`}><AuthIcon name={icon} className="w-[18px] h-[18px]" /></span>
        <input
          {...input}
          id={fieldId}
          name={name}
          type={reveal && shown ? "text" : type}
          aria-invalid={status === "error"}
          aria-describedby={shownNote ? noteId : undefined}
          onKeyUp={e => { if (reveal) setCapsLock(e.getModifierState("CapsLock")); onKeyUp?.(e); }}
          onBlur={e => { setCapsLock(false); onBlur?.(e); }}
          className="w-full min-w-0 bg-transparent pl-2.5 pr-2 py-2.5 text-[15px] text-zinc-50 placeholder:text-zinc-600 outline-none autofill:shadow-[inset_0_0_0_1000px_#18181b] autofill:[-webkit-text-fill-color:#fafafa]"
        />
        <span className="pr-2.5 flex items-center gap-1 shrink-0">
          {status === "checking" && <Spinner className="w-4 h-4 text-cyan-400" />}
          {status === "valid" && <span key="ok" className="auth-pop text-emerald-400"><AuthIcon name="check" className="w-[18px] h-[18px]" /></span>}
          {status === "error" && <span key="bad" className="auth-pop text-red-400"><AuthIcon name="alert" className="w-[18px] h-[18px]" /></span>}
          {reveal && (
            <button type="button" onClick={() => setShown(s => !s)} aria-label={shown ? "Hide password" : "Show password"}
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors">
              <AuthIcon name={shown ? "eyeOff" : "eye"} className="w-[18px] h-[18px]" />
            </button>
          )}
        </span>
      </div>

      {/* The message slides open and closed instead of making the form jump. */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${shownNote ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          {shownNote && (
            <p key={typeof shownNote.text === "string" ? shownNote.text : shownNote.tone} id={noteId} role={shownNote.tone === "error" ? "alert" : undefined}
              className={`auth-msg-in mt-1.5 ml-0.5 flex items-start gap-1.5 text-xs font-semibold ${NOTE_STYLES[shownNote.tone]}`}>
              <AuthIcon name={NOTE_ICONS[shownNote.tone]} className="w-3.5 h-3.5 mt-px shrink-0" />
              <span>{shownNote.text}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Banner for answers from the server (wrong password, account taken, ...).
export function AuthBanner({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const cls = tone === "error" ? "bg-red-500/10 border-red-500/30 text-red-300"
    : tone === "info" ? "bg-sky-500/10 border-sky-500/30 text-sky-200"
    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300";
  return (
    <div role="alert" className={`auth-msg-in flex items-start gap-3 rounded-xl border px-4 py-3 ${cls}`}>
      <AuthIcon name={tone === "success" ? "check" : "alert"} className="w-5 h-5 shrink-0" />
      <p className="text-sm font-semibold">{children}</p>
    </div>
  );
}

// Small underlined link, as in the reference design.
export const authLinkCls = "text-zinc-400 underline underline-offset-4 decoration-zinc-600 hover:text-cyan-300 hover:decoration-cyan-300 transition-colors";
