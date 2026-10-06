"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CONTACT } from "./contact";
import SmartImage from "./SmartImage";

// ---------------------------------------------------------------------------
// Interactive pieces of the home page: scroll progress, the rotating hero
// words, the "what does your car need?" finder, the fuel station section,
// tilting cards and the floating booking bar.
// ---------------------------------------------------------------------------

export interface HomePackage {
  packageId: number;
  name: string;
  description: string | null;
  price: number;
  durationMinutes: number;
}

const rupees = (n: number) => n.toLocaleString("en-LK", { maximumFractionDigits: 0 });
const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// True once the element has scrolled into view.
export function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

// Thin bar under the header that fills as the page is scrolled.
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (ref.current) ref.current.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1" aria-hidden="true">
      <div ref={ref} className="h-full origin-left bg-gradient-to-r from-rose-500 via-sky-400 to-amber-400" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

// Cycles through phrases, each sliding up into place.
export function RotatingWords({ words, interval = 2600 }: { words: string[]; interval?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const t = setInterval(() => setI(n => (n + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [words.length, interval]);
  return (
    <span className="hero-line" aria-live="polite">
      {/* The outer span slides up (.hero-line > span); the inner one shimmers. */}
      <span key={i}><span className="hero-shimmer">{words[i]}</span></span>
    </span>
  );
}

// Leans toward the pointer in 3D.
export function TiltCard({ children, className = "", max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg)`;
    el.style.setProperty("--glare-x", `${(x + 0.5) * 100}%`);
    el.style.setProperty("--glare-y", `${(y + 0.5) * 100}%`);
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ""; };
  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave}
      className={`group/tilt relative h-full transition-transform duration-300 ease-out will-change-transform ${className}`}>
      {children}
      {/* Light glare that follows the pointer */}
      <span className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover/tilt:opacity-100"
        style={{ background: "radial-gradient(420px circle at var(--glare-x, 50%) var(--glare-y, 50%), rgba(255,255,255,0.14), transparent 45%)" }} aria-hidden="true" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// "What does your car need?"
// ---------------------------------------------------------------------------

const P = {
  wrench: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  drop: "M12 3s-6 6.5-6 11a6 6 0 0012 0c0-4.5-6-11-6-11z",
  alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  brake: "M12 21a9 9 0 100-18 9 9 0 000 18zm0-5a4 4 0 100-8 4 4 0 000 8z",
  bolt: "M13 10V3L4 14h7v7l9-11h-7z",
  fuel: "M3 21V5a2 2 0 012-2h7a2 2 0 012 2v16M3 21h11M6 8h5m3 3h2a2 2 0 012 2v4a1.5 1.5 0 003 0V9l-3-3",
  check: "M5 13l4 4L19 7",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  arrow: "M14 5l7 7m0 0l-7 7m7-7H3",
  phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
};

function Svg({ d, className = "w-5 h-5", width = 1.8 }: { d: string; className?: string; width?: number }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={width} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

type Need = {
  id: string; label: string; icon: string; image: string;
  title: string; pkg?: RegExp; text: string; includes: string[];
};

const NEEDS: Need[] = [
  { id: "service", label: "Due for a service", icon: P.wrench, image: "/images/service-servicing.jpg", pkg: /mileage|basic/i,
    title: "Basic Mileage Service", text: "The regular check-up that keeps a healthy car healthy.",
    includes: ["Oil top-up & fluid levels", "Tyre pressure", "25-point safety inspection"] },
  { id: "oil", label: "Oil change", icon: P.drop, image: "/images/service-parts.jpg", pkg: /oil/i,
    title: "Synthetic Oil & Filter", text: "Fresh fully-synthetic oil and a new filter while you wait.",
    includes: ["Fully synthetic engine oil", "New oil filter", "Old oil disposed of safely"] },
  { id: "warning", label: "Warning light is on", icon: P.alert, image: "/images/service-diagnostics.jpg", pkg: /diagnostic/i,
    title: "Engine Diagnostic & Tuning", text: "We scan the car's computer and find the fault before fixing anything.",
    includes: ["Computer diagnostic scan", "Spark plugs & filters", "Engine tune-up"] },
  { id: "brakes", label: "Brakes squeak or feel soft", icon: P.brake, image: "/images/service-repair.jpg", pkg: /brake/i,
    title: "Brake Pad & Rotor Service", text: "Stopping safely matters most. We inspect and fix the whole brake set.",
    includes: ["Inspect & clean brakes", "Replace worn pads", "Skim or replace rotors"] },
  { id: "hybrid", label: "Hybrid battery check", icon: P.bolt, image: "/images/hero.jpg", pkg: /hybrid/i,
    title: "Hybrid Battery Health Check", text: "Know how your hybrid battery is doing before it lets you down.",
    includes: ["Diagnostic scan", "Battery capacity test", "Plain-language report"] },
  { id: "fuel", label: "I just need fuel", icon: P.fuel, image: "/images/service-fuel.jpg",
    title: "24-hour fuel station", text: "Petrol and diesel day and night, on the same site as the workshop.",
    includes: ["Open 24 hours, every day", "Digital pumps, accurate metering", "National Fuel Pass accepted"] },
];

export function ServiceFinder({ packages, bookHref }: { packages: HomePackage[] | null; bookHref: string }) {
  const [needId, setNeedId] = useState(NEEDS[0].id);
  const need = NEEDS.find(n => n.id === needId)!;
  const pkg = need.pkg ? packages?.find(p => need.pkg!.test(p.name)) : undefined;

  return (
    <div className="grid lg:grid-cols-[1fr_1.1fr] gap-8 lg:gap-12 items-stretch">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-700">Not sure what to book?</p>
        <h2 className="mt-3 text-3xl md:text-5xl font-black tracking-tight text-slate-900">What does your car need?</h2>
        <span className="mt-5 block h-1 w-24 rounded-full bg-gradient-to-r from-rose-600 to-amber-500" aria-hidden="true" />
        <p className="mt-5 text-slate-600 max-w-lg">Pick what&apos;s going on and we&apos;ll show you the right service, the starting price and how long it takes.</p>

        <div className="mt-8 grid grid-cols-2 gap-3" role="radiogroup" aria-label="What does your car need?">
          {NEEDS.map((n, i) => {
            const active = n.id === needId;
            return (
              <button key={n.id} type="button" role="radio" aria-checked={active} onClick={() => setNeedId(n.id)}
                className={`hero-fade-up group relative flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-bold transition-all duration-300 ring-1 ${
                  active
                    ? "bg-[#0a1430] text-white ring-2 ring-rose-500 shadow-xl shadow-rose-900/25 -translate-y-0.5"
                    : "bg-white text-slate-800 ring-slate-200 hover:ring-blue-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5"
                }`}
                style={{ animationDelay: `${i * 60}ms` }}>
                <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  active ? "bg-rose-600 text-white scale-110" : "bg-blue-50 text-blue-700 group-hover:scale-110"
                }`}>
                  <Svg d={n.icon} className="w-[18px] h-[18px]" />
                </span>
                {n.label}
                {active && <span className="absolute right-3 top-3 w-2 h-2 rounded-full bg-rose-500"><span className="absolute inset-0 rounded-full bg-rose-500 home-ping" /></span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* The answer card; re-animates on every pick */}
      <div key={need.id} className="finder-card-in relative overflow-hidden rounded-3xl bg-[#0a1430] text-white shadow-2xl shadow-blue-950/30 min-h-[26rem] flex flex-col">
        <div className="relative h-48 sm:h-56 overflow-hidden">
          <div className="absolute inset-0 home-zoom">
            <SmartImage src={need.image} alt="" eager className="w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a1430] via-[#0a1430]/40 to-transparent" />
          <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent home-sweep" aria-hidden="true" />
          <span className="absolute left-6 top-5 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em]">We recommend</span>
        </div>
        <div className="relative flex-1 flex flex-col p-6 sm:p-8 -mt-10">
          <h3 className="text-2xl sm:text-3xl font-black tracking-tight">{pkg?.name ?? need.title}</h3>
          <p className="mt-2 text-slate-300">{need.text}</p>
          <ul className="mt-5 grid sm:grid-cols-3 gap-2">
            {need.includes.map((item, i) => (
              <li key={item} className="hero-fade-up flex items-start gap-2 rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2.5 text-xs font-semibold text-slate-200" style={{ animationDelay: `${150 + i * 90}ms` }}>
                <Svg d={P.check} className="w-4 h-4 shrink-0 text-emerald-400" width={2.5} /> {item}
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-6 flex flex-col sm:flex-row sm:items-end gap-5 justify-between">
            {pkg ? (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-300">Starting from</p>
                <p className="text-3xl font-black tabular-nums">LKR {rupees(pkg.price)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"><Svg d={P.clock} className="w-4 h-4" /> About {duration(pkg.durationMinutes)} in the bay</p>
              </div>
            ) : need.id === "fuel" ? (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">Open now</p>
                <p className="text-3xl font-black">24 / 7</p>
                <p className="mt-1 text-xs text-slate-400">{CONTACT.address}</p>
              </div>
            ) : <div />}
            {need.id === "fuel" ? (
              <a href={CONTACT.phoneHref} className="group inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 hover:bg-amber-400 px-6 py-3.5 font-bold text-slate-950 transition-all hover:-translate-y-0.5">
                <Svg d={P.phone} className="w-5 h-5" /> Call the station
              </a>
            ) : (
              <Link href={bookHref} className="group relative overflow-hidden inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 hover:bg-rose-500 px-6 py-3.5 font-bold transition-all hover:-translate-y-0.5 shadow-lg shadow-rose-900/40">
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" aria-hidden="true" />
                <span className="relative">Book this service</span>
                <Svg d={P.arrow} className="relative w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fuel station
// ---------------------------------------------------------------------------

// Counts up once the pump scrolls into view, like the pump's own display.
function PumpDisplay({ run }: { run: boolean }) {
  const [litres, setLitres] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (reducedMotion()) { const t = setTimeout(() => setLitres(40), 0); return () => clearTimeout(t); }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 4200);
      setLitres(40 * (1 - Math.pow(1 - t, 2)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run]);
  return <>{litres.toFixed(2)}</>;
}

function FuelPump({ run }: { run: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-[420px] aspect-[4/5]">
      <div className="absolute inset-[8%] rounded-full bg-amber-500/20 blur-3xl" aria-hidden="true" />
      <svg viewBox="0 0 320 400" className="relative w-full h-full" aria-hidden="true">
        <defs>
          <linearGradient id="pump-body" x1="0" x2="1">
            <stop offset="0" stopColor="#e11d48" /><stop offset="1" stopColor="#9f1239" />
          </linearGradient>
          <linearGradient id="pump-gauge" x1="0" x2="1">
            <stop offset="0" stopColor="#ef4444" /><stop offset="0.5" stopColor="#f59e0b" /><stop offset="1" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        {/* ground shadow */}
        <ellipse cx="140" cy="378" rx="120" ry="12" fill="rgba(0,0,0,0.35)" />
        {/* body */}
        <rect x="40" y="40" width="200" height="330" rx="22" fill="url(#pump-body)" />
        <rect x="40" y="40" width="200" height="56" rx="22" fill="#be123c" />
        <text x="140" y="76" textAnchor="middle" fill="white" fontSize="18" fontWeight="900" letterSpacing="3">FUEL 24/7</text>
        {/* screen */}
        <rect x="64" y="112" width="152" height="92" rx="12" fill="#0b1222" />
        <text x="78" y="134" fill="#64748b" fontSize="10" fontWeight="700" letterSpacing="2">LITRES</text>
        {/* gauge on the body */}
        <path d="M84 300 A56 56 0 0 1 196 300" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="10" strokeLinecap="round" />
        <path d="M84 300 A56 56 0 0 1 196 300" fill="none" stroke="url(#pump-gauge)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray="176" strokeDashoffset={run ? 30 : 176} style={{ transition: "stroke-dashoffset 4.2s cubic-bezier(0.25,1,0.5,1)" }} />
        <g style={{ transformOrigin: "140px 300px", transform: `rotate(${run ? 62 : -88}deg)`, transition: "transform 4.2s cubic-bezier(0.25,1,0.5,1)" }}>
          <line x1="140" y1="300" x2="140" y2="256" stroke="white" strokeWidth="4" strokeLinecap="round" />
        </g>
        <circle cx="140" cy="300" r="7" fill="white" />
        <text x="84" y="324" fill="white" fontSize="12" fontWeight="800">E</text>
        <text x="188" y="324" fill="white" fontSize="12" fontWeight="800">F</text>
        {/* nozzle holder and hose */}
        <rect x="240" y="150" width="26" height="70" rx="8" fill="#881337" />
        <path d="M262 214 C 300 240, 300 330, 250 352 S 180 380, 170 390" fill="none" stroke="#1f2937" strokeWidth="10" strokeLinecap="round" />
        <path d="M262 214 C 300 240, 300 330, 250 352 S 180 380, 170 390" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round"
          strokeDasharray="6 14" className={run ? "pump-flow" : ""} opacity="0.85" />
        <path d="M252 150 l18 -26 h14 l-6 34 z" fill="#111827" />
      </svg>
      {/* The live number, laid over the SVG screen */}
      <div className="absolute left-[20%] top-[34%] w-[47.5%] text-right pr-[3%] font-mono text-3xl sm:text-4xl font-black tabular-nums text-emerald-400 [text-shadow:0_0_12px_rgba(52,211,153,0.7)]">
        <PumpDisplay run={run} />
      </div>
    </div>
  );
}

export function FuelStation() {
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const points = [
    { icon: P.clock, title: "Open 24 hours", text: "Day or night, every day of the year." },
    { icon: P.fuel, title: "Petrol & diesel", text: "Digital pumps with accurate metering." },
    { icon: P.qr, title: "National Fuel Pass", text: "Accepted at every pump; our attendants check your quota." },
    { icon: P.wrench, title: "Workshop next door", text: "Fuel up while your car is serviced on the same site." },
  ];
  return (
    <div ref={ref} className="relative grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Fuel station</p>
        <h2 className="mt-3 text-3xl md:text-5xl font-black tracking-tight">Fuel up any time, <span className="text-amber-400">day or night.</span></h2>
        <span className="mt-5 block h-1 w-24 rounded-full bg-gradient-to-r from-amber-500 to-rose-500" aria-hidden="true" />
        <p className="mt-5 text-slate-300 max-w-xl">Our 24-hour station sits right beside the workshop on Kandy Road, Malabe — fill the tank when you drop the car off or on your way home.</p>
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          {points.map((p, i) => (
            <div key={p.title}
              className={`group rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5 transition-all duration-700 hover:bg-white/[0.08] hover:-translate-y-1 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
              style={{ transitionDelay: inView ? `${i * 120}ms` : "0ms" }}>
              <span className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                <Svg d={p.icon} />
              </span>
              <h3 className="mt-3 font-black">{p.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{p.text}</p>
            </div>
          ))}
        </div>
      </div>
      <FuelPump run={inView} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating booking bar: slides up once the hero is out of view
// ---------------------------------------------------------------------------

export function FloatingBookBar({ href, label, after }: { href: string; label: string; after: React.RefObject<HTMLElement | null> }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = after.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShown(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [after]);
  return (
    // Phones: pinned left so it clears the round WhatsApp button on the right.
    <div className={`fixed bottom-6 left-4 sm:left-1/2 sm:-translate-x-1/2 z-40 transition-all duration-500 ${shown ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0 pointer-events-none"}`}>
      <div className="flex items-center gap-2 rounded-full bg-[#0a1430]/90 backdrop-blur-md ring-1 ring-white/15 p-1.5 pl-5 shadow-2xl shadow-black/40 text-white">
        <span className="hidden sm:inline text-sm font-semibold text-slate-200">Your car deserves a check-up</span>
        <Link href={href} className="group relative overflow-hidden inline-flex items-center gap-2 rounded-full bg-rose-600 hover:bg-rose-500 px-5 py-2.5 text-sm font-bold transition-colors">
          <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" aria-hidden="true" />
          <span className="relative">{label}</span>
          <Svg d={P.arrow} className="relative w-4 h-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}
