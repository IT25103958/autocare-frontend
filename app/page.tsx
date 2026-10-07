"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./context/AuthContext";
import { publicApi } from "../utils/axiosInstance";
import { CONTACT, WhatsAppIcon } from "./_components/contact";
import SmartImage from "./_components/SmartImage";
import { FloatingBookBar, FuelStation, RotatingWords, ScrollProgress, ServiceFinder, TiltCard, useInView } from "./_components/HomeExtras";

// ---------------------------------------------------------------------------
// Public home page. Photos live in public/images; each one sits on top of a
// gradient so the layout still holds if a file is missing.
// ---------------------------------------------------------------------------

interface ServicePackage {
  packageId: number;
  name: string;
  description: string | null;
  price: number;
  durationMinutes: number;
}

// Shown if the catalogue can't be loaded; same as the packages the backend seeds.
const FALLBACK_PACKAGES: ServicePackage[] = [
  { packageId: -1, name: "Basic Mileage Service", description: "Oil top-up, fluid levels, tyre pressure and a 25-point safety inspection.", price: 4500, durationMinutes: 60 },
  { packageId: -2, name: "Synthetic Oil & Filter Replacement", description: "Fully synthetic engine oil and a new oil filter.", price: 6500, durationMinutes: 60 },
  { packageId: -3, name: "Hybrid Battery Health Check", description: "Diagnostic scan and capacity test of the hybrid battery pack.", price: 7500, durationMinutes: 60 },
  { packageId: -4, name: "Brake Pad & Rotor Servicing", description: "Inspect, clean and replace brake pads; skim or replace rotors as needed.", price: 9500, durationMinutes: 90 },
  { packageId: -5, name: "Full Engine Diagnostic & Tuning", description: "Computer diagnostic, spark plugs, filters and engine tune-up.", price: 12000, durationMinutes: 120 },
];

// Fade/slide in the first time the element scrolls into view.
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { el.classList.add("is-visible"); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

// Counts up to `target` once visible.
function CountUp({ target, suffix = "" }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1200);
        setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(frame); };
  }, [target]);
  return <span ref={ref}>{value}{suffix}</span>;
}

function SectionTitle({ eyebrow, title, sub, light = false }: { eyebrow: string; title: string; sub?: string; light?: boolean }) {
  return (
    <Reveal className="text-center mb-12">
      <p className={`text-xs font-bold uppercase tracking-[0.3em] ${light ? "text-blue-300" : "text-blue-700"}`}>{eyebrow}</p>
      <h2 className={`mt-3 text-3xl md:text-5xl font-black tracking-tight ${light ? "text-white" : "text-slate-900"}`}>{title}</h2>
      <span className="mt-5 mx-auto block h-1 w-24 rounded-full bg-gradient-to-r from-rose-600 to-rose-500" aria-hidden="true" />
      {sub && <p className={`mt-5 max-w-2xl mx-auto ${light ? "text-slate-300" : "text-slate-600"}`}>{sub}</p>}
    </Reveal>
  );
}

const Icon = ({ d, className = "w-6 h-6" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const ICON = {
  wrench: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  repair: "M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085",
  diag: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2",
  fuel: "M3 21V5a2 2 0 012-2h7a2 2 0 012 2v16M3 21h11M6 8h5m3 3h2a2 2 0 012 2v4a1.5 1.5 0 003 0V9l-3-3",
  box: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  star: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  check: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  track: "M13 10V3L4 14h7v7l9-11h-7z",
  card: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  arrow: "M14 5l7 7m0 0l-7 7m7-7H3",
  phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  shield: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  receipt: "M9 14l2 2 4-4M7 3h10a2 2 0 012 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 012-2z",
  bell: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  pin: "M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z",
  mail: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  chevron: "M19 9l-7 7-7-7",
};

const SERVICES = [
  // `focus` is the object-position that keeps the subject inside the wide card crop.
  { icon: ICON.wrench, title: "Vehicle Servicing", image: "/images/service-servicing.jpg", focus: "object-center", text: "Scheduled servicing with genuine oils and filters, fluid checks and a full safety inspection.", tone: "from-blue-700 to-blue-900" },
  { icon: ICON.repair, title: "Mechanical Repair", image: "/images/service-repair.jpg", focus: "object-[50%_45%]", text: "Brakes, suspension, engine and transmission repairs by experienced technicians.", tone: "from-slate-700 to-slate-900" },
  { icon: ICON.diag, title: "Computer Diagnostics", image: "/images/service-diagnostics.jpg", focus: "object-[50%_60%]", text: "Scanner diagnostics for engine, electrical and hybrid systems — we find the fault first.", tone: "from-indigo-700 to-slate-900" },
  { icon: ICON.fuel, title: "Fuel Station", image: "/images/service-fuel.jpg", focus: "object-center", text: "Petrol and diesel around the clock, with digital pumps and accurate metering.", tone: "from-sky-700 to-blue-950" },
  { icon: ICON.box, title: "Genuine Spare Parts", image: "/images/service-parts.jpg", focus: "object-center", text: "A tracked parts inventory so the right part is on the shelf when your car is in the bay.", tone: "from-blue-800 to-indigo-950" },
  { icon: ICON.star, title: "Lanka Auto Rewards", image: "/images/service-rewards.jpg", focus: "object-[50%_20%]", text: "Earn points on every paid service and use them to pay part of your next bill.", tone: "from-rose-700 to-slate-900" },
];

// Backdrops for the package cards, cycled by position.
const PACKAGE_PHOTOS = ["/images/service-servicing.jpg", "/images/service-parts.jpg", "/images/service-diagnostics.jpg", "/images/service-repair.jpg"];

const ABOUT_POINTS = [
  "Scanner diagnostics for engine, electrical and hybrid systems",
  "Cars, SUVs, vans and hybrids from all major makes",
  "Workshop open Monday to Saturday, fuel station open 24 hours",
];

const WHY = [
  { icon: ICON.track, title: "Live job tracking", text: "See your vehicle move from check-in to in-progress to ready — no need to call and ask." },
  { icon: ICON.receipt, title: "Clear, itemised bills", text: "Labour and parts listed line by line. Pay online or at the counter and get an emailed receipt." },
  { icon: ICON.shield, title: "Genuine parts only", text: "Every part is tracked in our inventory from supplier to your vehicle." },
  { icon: ICON.bell, title: "Reminders & updates", text: "Booking confirmations and pickup notices so you always know what's next." },
];

const STEPS = [
  { icon: ICON.calendar, title: "Book online", text: "Pick a service and a free time slot in seconds." },
  { icon: ICON.check, title: "We confirm", text: "A rostered technician and bay are assigned to you." },
  { icon: ICON.track, title: "Track live", text: "Follow the job from check-in to ready for pickup." },
  { icon: ICON.card, title: "Pay & earn", text: "Pay online or at the counter, get your receipt and points." },
];

const TIERS = [
  { name: "Bronze", text: "Every member starts here and earns points from the first paid bill.", tone: "from-amber-700 via-amber-600 to-orange-800" },
  { name: "Silver", text: "Reached as your lifetime points grow with regular visits.", tone: "from-slate-400 via-slate-300 to-slate-500" },
  { name: "Gold", text: "For our loyal regulars — keep servicing and climbing.", tone: "from-yellow-500 via-amber-300 to-yellow-600" },
  { name: "Platinum", text: "Our top tier for the most dedicated Lanka Auto Care drivers.", tone: "from-indigo-500 via-sky-300 to-indigo-700" },
];

const FAQS = [
  { q: "Do I need an account to book a service?", a: "Yes — a free customer account lets you book, track the job, see your bills and collect reward points. It takes under a minute to register." },
  { q: "How can I pay my bill?", a: "Pay online from My Garage once the job is done, or pay by cash or card at the counter. A receipt is emailed to you when the bill is fully paid." },
  { q: "How do reward points work?", a: "You earn points on every paid bill. Points can be redeemed against a future bill, and your tier rises as your lifetime points grow." },
  { q: "Which vehicles do you service?", a: "Cars, SUVs, vans and hybrids from all major makes — Japanese, Korean, Chinese and European." },
  { q: "Is the fuel station open all day?", a: "Yes, the fuel station is open 24 hours. The workshop is open Monday to Saturday, 8 am to 6 pm." },
];

// Logos live in public/brands/<file>.png
const BRANDS = [
  { name: "Toyota", file: "toyota" },
  { name: "Honda", file: "honda" },
  { name: "Nissan", file: "nissan" },
  { name: "Suzuki", file: "suzuki" },
  { name: "Mitsubishi", file: "mitsubishi" },
  { name: "Mazda", file: "mazda" },
  { name: "Subaru", file: "subaru" },
  { name: "Lexus", file: "lexus" },
  { name: "BYD", file: "byd" },
  { name: "MG", file: "mg" },
  { name: "Daihatsu", file: "daihatsu" },
  { name: "Hyundai", file: "hyundai" },
  { name: "Kia", file: "kia" },
  { name: "BMW", file: "bmw" },
  { name: "Mercedes-Benz", file: "mercedes-benz" },
  { name: "Perodua", file: "perodua" },
];
const HERO_WORDS = ["booked in minutes.", "tracked live.", "paid online.", "fuelled 24/7."];
const TICKER = ["Book online in 60 seconds", "Live job tracking", "Pay your bill online", "Earn reward points", "Genuine spare parts", "24-hour fuel station", "Hybrid specialists", "All makes & models"];

const rupees = (n: number) => n.toLocaleString("en-LK", { maximumFractionDigits: 0 });
const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);

// ---------------------------------------------------------------------------
// Hero photo collage. Each layer shifts with the pointer by its own depth
// (--mx / --my are set on the hero section), then animates in and floats.
// ---------------------------------------------------------------------------

const depth = (px: number) => ({ "--depth": `${px}px` }) as React.CSSProperties;

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[600px] aspect-[10/9]">
      <div className="absolute left-[14%] top-[1%] w-[66%] aspect-square rounded-full border border-dashed border-white/15 home-spin-slow" aria-hidden="true" />
      <div className="absolute left-[22%] top-[14%] w-[50%] aspect-square rounded-full bg-blue-500/25 blur-3xl" aria-hidden="true" />

      {/* Main photo */}
      <div className="hero-layer absolute left-[21%] top-[3%] w-[52%] h-[94%]" style={depth(14)}>
        <div className="hero-card-in h-full" style={{ animationDelay: "200ms" }}>
          <div className="relative h-full overflow-hidden rounded-[2rem] ring-1 ring-white/20 shadow-2xl shadow-black/50">
            <SmartImage eager src="/images/service-diagnostics.jpg" alt="A technician running diagnostics on a tablet beside a vehicle on the lift" className="w-full h-full object-cover object-[85%_50%]" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a1430]/70 via-transparent to-transparent" aria-hidden="true" />
            <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent home-sweep" style={{ animationDuration: "7s" }} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Fuel photo */}
      <div className="hero-layer absolute right-0 top-[9%] w-[33%]" style={depth(34)}>
        <div className="hero-card-in" style={{ animationDelay: "380ms" }}>
          <div className="home-float aspect-square overflow-hidden rounded-3xl ring-4 ring-white/10 shadow-xl shadow-black/40">
            <SmartImage eager src="/images/service-fuel.jpg" alt="Refuelling a car at the fuel station" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      {/* Engine photo */}
      <div className="hero-layer absolute left-0 bottom-[9%] w-[37%]" style={depth(46)}>
        <div className="hero-card-in" style={{ animationDelay: "520ms" }}>
          <div className="home-float aspect-[4/3] overflow-hidden rounded-3xl ring-4 ring-white/10 shadow-xl shadow-black/40" style={{ animationDelay: "-3s" }}>
            <SmartImage eager src="/images/service-servicing.jpg" alt="A technician working on an engine" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      {/* Floating labels */}
      <div className="hero-layer absolute left-[2%] top-[14%]" style={depth(60)}>
        <div className="hero-card-in" style={{ animationDelay: "700ms" }}>
          <div className="flex items-center gap-2.5 rounded-2xl bg-[#0a1430]/80 backdrop-blur-md ring-1 ring-white/20 px-4 py-3 shadow-lg shadow-black/30">
            <span className="relative flex w-2.5 h-2.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 home-ping" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs sm:text-sm font-bold">Live job tracking</span>
          </div>
        </div>
      </div>

      <div className="hero-layer absolute -right-[1%] bottom-[12%] w-[46%]" style={depth(60)}>
        <div className="hero-card-in" style={{ animationDelay: "840ms" }}>
          <div className="rounded-2xl bg-white text-slate-900 p-3 sm:p-4 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                <Icon d={ICON.check} className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs sm:text-sm font-black leading-tight">Ready for pickup</span>
                <span className="block text-[10px] sm:text-xs text-slate-500 truncate">Basic Mileage Service · Bay 2</span>
              </span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 home-grow" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



// A phone showing the customer's live job tracker.
function PhoneMock() {
  const steps = ["Checked in", "Inspection", "In progress", "Ready for pickup"];
  return (
    <div className="relative mx-auto w-[270px] home-float">
      <div className="absolute -inset-10 rounded-full bg-blue-500/20 blur-3xl" aria-hidden="true" />
      <div className="relative rounded-[2.5rem] bg-slate-900 p-3 shadow-2xl shadow-blue-950/40 ring-1 ring-white/10">
        <div className="rounded-[2rem] bg-slate-50 overflow-hidden">
          <div className="bg-[#0a1430] px-5 pt-6 pb-5 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">My Garage</p>
            <p className="mt-1 font-black">Toyota Aqua · CAB-4521</p>
            <p className="text-xs text-slate-300">Basic Mileage Service · Bay 2</p>
          </div>
          <div className="p-5 space-y-4">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <span className={`relative w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black ${i < 3 ? "bg-emerald-500 text-white" : "bg-white ring-2 ring-blue-600 text-blue-700"}`}>
                  {i < 3 ? "✓" : i + 1}
                  {i === 3 && <span className="absolute inset-0 rounded-full ring-2 ring-blue-500 home-ping" />}
                </span>
                <span className={`text-sm font-semibold ${i < 3 ? "text-slate-500" : "text-slate-900"}`}>{s}</span>
              </div>
            ))}
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full w-[85%] rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 home-grow" />
            </div>
            <div className="rounded-xl bg-white ring-1 ring-slate-200 p-3 flex items-center justify-between">
              <span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Bill</span>
                <span className="block text-sm font-black text-slate-900">LKR 6,850</span>
              </span>
              <span className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white">Pay now</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function HomePage() {
  const { user } = useAuth();
  const [packages, setPackages] = useState<ServicePackage[] | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [stepsRef, stepsInView] = useInView<HTMLDivElement>(0.4);

  useEffect(() => {
    publicApi.get<ServicePackage[]>("/service-packages")
      .then(res => setPackages(res.data.length ? res.data : FALLBACK_PACKAGES))
      .catch(() => setPackages(FALLBACK_PACKAGES));
  }, []);

  // Feed the pointer position (-0.5..0.5) to the hero's parallax layers.
  const onHeroMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  };
  const onHeroLeave = () => {
    heroRef.current?.style.setProperty("--mx", "0");
    heroRef.current?.style.setProperty("--my", "0");
  };

  const isStaff = !!user && user.role !== "CUSTOMER";
  const primary = isStaff ? { href: "/dashboard", label: "Go to Dashboard" } : { href: "/customers/book", label: "Book a Service" };
  const secondary = user?.role === "CUSTOMER"
    ? { href: "/customers/dashboard", label: "My Garage" }
    : !user ? { href: "/register", label: "Create an Account" } : null;
  const shownPackages = packages?.slice(0, 4) ?? [];

  return (
    <div className="bg-white -mb-12">
      <ScrollProgress />
      <FloatingBookBar href={primary.href} label={primary.label} after={heroRef} />

      {/* ================= HERO ================= */}
      <section ref={heroRef} onMouseMove={onHeroMove} onMouseLeave={onHeroLeave} className="relative overflow-hidden bg-[#0a1430] text-white">
        {/* Background: drifting colour, a faint grid and a slow light sweep */}
        <div className="absolute inset-0" aria-hidden="true">
          <div className="hero-blob absolute -top-40 -right-[10%] w-[46rem] h-[46rem] rounded-full bg-blue-600/30 blur-[120px]" />
          <div className="hero-blob absolute -bottom-56 -left-40 w-[40rem] h-[40rem] rounded-full bg-rose-600/20 blur-[120px]" style={{ animationDelay: "-7s" }} />
          <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
          <span className="absolute inset-y-0 -left-1/4 w-1/4 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent home-sweep" style={{ animationDuration: "9s" }} />
          {/* Soft light that follows the pointer */}
          <div className="absolute inset-0 transition-[background] duration-300"
            style={{ background: "radial-gradient(640px circle at calc((var(--mx, 0) + 0.5) * 100%) calc((var(--my, 0) + 0.5) * 100%), rgba(56, 189, 248, 0.13), transparent 60%)" }} />
        </div>

        <div className="relative max-w-[1480px] mx-auto px-4 lg:px-10 py-14 lg:py-20 grid lg:grid-cols-[1.1fr_1fr] gap-14 items-center">
          <div>
            <span className="hero-fade-up inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-blue-200">
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-rose-500 home-ping" />
                <span className="relative w-2 h-2 rounded-full bg-rose-500" />
              </span>
              Service centre · Fuel station · Malabe
            </span>
            <h1 className="mt-6 text-4xl sm:text-5xl xl:text-7xl font-black tracking-tight leading-[1.05]">
              <span className="hero-line"><span style={{ animationDelay: "120ms" }}>Expert car care,</span></span>
              <RotatingWords words={HERO_WORDS} />
            </h1>
            <p className="hero-fade-up mt-6 text-lg text-slate-300 max-w-xl leading-relaxed" style={{ animationDelay: "420ms" }}>
              Book a service online, follow your vehicle from check-in to pickup, pay your bill online and earn rewards —
              with a 24-hour fuel station on the same site.
            </p>
            <div className="hero-fade-up mt-8 flex flex-col sm:flex-row gap-3" style={{ animationDelay: "540ms" }}>
              <Link href={primary.href} className="group relative overflow-hidden inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 hover:bg-rose-500 px-7 py-4 font-bold shadow-lg shadow-rose-900/40 transition-all hover:-translate-y-0.5">
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" aria-hidden="true" />
                <span className="relative">{primary.label}</span>
                <Icon d={ICON.arrow} className="relative w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
              {secondary && (
                <Link href={secondary.href} className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 hover:bg-white/10 px-7 py-4 font-bold transition-all hover:-translate-y-0.5">
                  {secondary.label}
                </Link>
              )}
            </div>
            <div className="hero-fade-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-300" style={{ animationDelay: "660ms" }}>
              <a href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2 hover:text-white transition-colors">
                <span className="w-9 h-9 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center transition-transform group-hover:scale-110"><WhatsAppIcon className="w-4 h-4" /></span>
                Chat on WhatsApp
              </a>
              <a href={CONTACT.phoneHref} className="group inline-flex items-center gap-2 hover:text-white transition-colors">
                <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center transition-transform group-hover:scale-110"><Icon d={ICON.phone} className="w-4 h-4" /></span>
                {CONTACT.phone}
              </a>
            </div>
          </div>

          <HeroVisual />
        </div>

        {/* Stats */}
        <div className="relative border-t border-white/10 bg-white/[0.03] backdrop-blur">
          <div className="max-w-[1480px] mx-auto px-4 lg:px-10 grid grid-cols-2 lg:grid-cols-4">
            {[
              { value: 4, suffix: "", label: "Service bays" },
              { value: 4, suffix: "", label: "Fuel pumps" },
              { value: 24, suffix: "/7", label: "Fuel station" },
              { value: BRANDS.length, suffix: "+", label: "Brands serviced" },
            ].map((s, i) => (
              <div key={s.label} className={`py-6 px-4 text-center ${i % 2 === 1 ? "border-l border-white/10" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
                <p className="text-3xl md:text-4xl font-black tabular-nums"><CountUp target={s.value} suffix={s.suffix} /></p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-blue-200">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= TICKER ================= */}
      <div className="bg-rose-600 text-white overflow-hidden py-3.5" aria-hidden="true">
        <div className="home-marquee flex w-max" style={{ animationDuration: "30s" }}>
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="shrink-0 flex items-center gap-6 pr-6 text-sm font-bold uppercase tracking-[0.18em]">
              {t} <span className="w-1.5 h-1.5 rotate-45 bg-white/70" />
            </span>
          ))}
        </div>
      </div>

      {/* ================= SERVICE FINDER ================= */}
      <section className="py-20 bg-slate-50 overflow-hidden">
        <div className="max-w-[1480px] mx-auto px-4 lg:px-10">
          <Reveal><ServiceFinder packages={packages} bookHref={primary.href} /></Reveal>
        </div>
      </section>

      {/* ================= ABOUT ================= */}
      <section className="py-20 bg-white overflow-hidden">
        <div className="max-w-[1480px] mx-auto px-4 lg:px-10 grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
          <Reveal className="relative w-full max-w-xl mx-auto pb-12 pr-10 sm:pr-20">
            <div className="absolute -left-5 -top-5 w-44 h-44 bg-[radial-gradient(circle_at_1px_1px,#cbd5e1_1.5px,transparent_0)] bg-[size:14px_14px]" aria-hidden="true" />
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-slate-200 shadow-2xl shadow-slate-900/20">
              <SmartImage src="/images/about-technician.jpg" alt="A technician inspecting an engine in the workshop" className="w-full h-full object-cover" />
            </div>
            <div className="absolute bottom-0 right-0 w-[55%] aspect-[4/3] overflow-hidden rounded-2xl bg-slate-200 ring-8 ring-white shadow-xl shadow-slate-900/20">
              <SmartImage src="/images/hero.jpg" alt="Two technicians checking the underside of a vehicle on a lift" className="w-full h-full object-cover object-[60%_50%]" />
            </div>
            <div className="absolute top-8 right-0 rounded-2xl bg-[#0a1430] px-5 py-4 text-white shadow-xl shadow-slate-900/30">
              <p className="text-3xl font-black leading-none">24/7</p>
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-200">Fuel station</p>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-700">About Lanka Auto Care</p>
            <h2 className="mt-3 text-3xl md:text-5xl font-black tracking-tight text-slate-900">One site for servicing, repairs and fuel.</h2>
            <span className="mt-5 block h-1 w-24 rounded-full bg-gradient-to-r from-rose-600 to-rose-500" aria-hidden="true" />
            <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-xl">
              Lanka Auto Care is a full vehicle service centre and fuel station on Kandy Road, Malabe. Our technicians
              diagnose the fault first, fit genuine parts and keep you updated online from check-in to pickup.
            </p>
            <ul className="mt-7 space-y-4">
              {ABOUT_POINTS.map(point => (
                <li key={point} className="flex items-start gap-3 font-semibold text-slate-800">
                  <Icon d={ICON.check} className="w-6 h-6 shrink-0 text-rose-600" /> {point}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link href={primary.href} className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#0a1430] hover:bg-blue-800 px-7 py-3.5 font-bold text-white transition-all hover:-translate-y-0.5">
                {primary.label} <Icon d={ICON.arrow} className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#packages" className="inline-flex items-center justify-center rounded-full border-2 border-slate-200 hover:border-slate-900 px-7 py-3.5 font-bold text-slate-900 transition-colors">
                View packages
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= SERVICES ================= */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-[1480px] mx-auto px-4 lg:px-10">
          <SectionTitle eyebrow="What we do" title="Our Services" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-7">
            {SERVICES.map((s, i) => (
              <Reveal key={s.title} delay={(i % 3) * 120}>
                <TiltCard>
                <article className="group h-full flex flex-col overflow-hidden rounded-2xl bg-white shadow-md shadow-slate-900/5 ring-1 ring-slate-200 transition-shadow duration-500 hover:shadow-2xl hover:shadow-slate-900/15">
                  <div className={`relative h-56 overflow-hidden bg-gradient-to-br ${s.tone}`}>
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] bg-[size:18px_18px]" aria-hidden="true" />
                    <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-110">
                      <SmartImage src={s.image} alt={s.title} className={`w-full h-full object-cover ${s.focus}`} />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a1430]/80 via-[#0a1430]/10 to-transparent" aria-hidden="true" />
                    <span className="absolute left-5 bottom-4 w-11 h-11 rounded-xl bg-white/15 backdrop-blur ring-1 ring-white/30 text-white flex items-center justify-center">
                      <Icon d={s.icon} className="w-5 h-5" />
                    </span>
                    <span className="absolute inset-y-0 -left-1/3 w-1/4 bg-gradient-to-r from-transparent via-white/25 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-[520%] transition-transform duration-1000" aria-hidden="true" />
                  </div>
                  <div className="h-1.5 bg-[#0a1430]" aria-hidden="true" />
                  <div className="flex-1 flex flex-col p-7">
                    <h3 className="text-2xl font-black text-slate-900">{s.title}</h3>
                    <span className="mt-3 block h-1 w-14 rounded-full bg-rose-600 transition-all duration-500 group-hover:w-28" aria-hidden="true" />
                    <p className="mt-4 text-slate-600 leading-relaxed flex-1">{s.text}</p>
                    <Link href="/customers/book" className="mt-6 self-start inline-flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-500 px-5 py-2.5 text-sm font-bold text-white transition-colors">
                      Book now <Icon d={ICON.arrow} className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </div>
                </article>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= PACKAGES ================= */}
      <section id="packages" className="py-20 bg-white scroll-mt-32">
        <div className="max-w-[1480px] mx-auto px-4 lg:px-10">
          <SectionTitle eyebrow="Transparent pricing" title="Service Packages" sub="Fixed starting prices for our most popular jobs. Book online and see the exact price for your vehicle." />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {packages === null
              ? [0, 1, 2, 3].map(i => <div key={i} className="h-[26rem] rounded-2xl bg-slate-100 animate-pulse" />)
              : shownPackages.map((p, i) => (
                <Reveal key={p.packageId} delay={i * 100}>
                  <article className="group h-full flex flex-col overflow-hidden rounded-2xl ring-1 ring-slate-200 bg-white shadow-sm transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-blue-950/20">
                    <div className="relative h-44 overflow-hidden bg-gradient-to-b from-[#0a1430] to-[#1e2d57]">
                      <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-110">
                        <SmartImage src={PACKAGE_PHOTOS[i % PACKAGE_PHOTOS.length]} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0a1430] via-[#0a1430]/75 to-[#0a1430]/40" aria-hidden="true" />
                      <div className="absolute inset-x-0 bottom-0 p-5">
                        <span className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur ring-1 ring-white/25 text-white flex items-center justify-center">
                          <Icon d={ICON.wrench} className="w-5 h-5" />
                        </span>
                        <p className="mt-3 text-lg text-white font-black leading-tight">{p.name}</p>
                      </div>
                      {i === 0 && <span className="absolute top-3 right-3 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-900">Most popular</span>}
                    </div>
                    <div className="bg-rose-600 text-white text-center py-3.5 font-black text-lg tracking-tight">
                      LKR {rupees(p.price)} <span className="font-bold text-rose-100">+ Upwards</span>
                    </div>
                    <div className="flex-1 flex flex-col p-6 text-center">
                      <p className="text-sm text-slate-600 leading-relaxed flex-1">{p.description || "Complete service by our trained technicians."}</p>
                      <p className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                        <Icon d={ICON.clock} className="w-4 h-4" /> About {duration(p.durationMinutes)} in the bay
                      </p>
                      <Link href="/customers/book" className="mt-5 inline-flex items-center justify-center rounded-lg bg-[#0a1430] hover:bg-blue-800 px-6 py-3 font-bold text-white transition-colors">
                        Book Now
                      </Link>
                    </div>
                  </article>
                </Reveal>
              ))}
          </div>
          {packages && packages.length > shownPackages.length && (
            <div className="mt-10 text-center">
              <Link href="/customers/book" className="group inline-flex items-center gap-2 rounded-full border-2 border-slate-900 px-6 py-3 font-bold text-slate-900 hover:bg-slate-900 hover:text-white transition-colors">
                See all {packages.length} packages <Icon d={ICON.arrow} className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ================= FUEL STATION ================= */}
      <section className="relative py-20 bg-[#0a1430] text-white overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          <div className="hero-blob absolute -top-32 -left-24 w-[34rem] h-[34rem] rounded-full bg-amber-500/15 blur-[120px]" />
          <div className="hero-blob absolute -bottom-40 right-0 w-[30rem] h-[30rem] rounded-full bg-rose-600/15 blur-[120px]" style={{ animationDelay: "-6s" }} />
          <div className="absolute inset-0 opacity-[0.05] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] bg-[size:22px_22px]" />
        </div>
        <div className="relative max-w-[1480px] mx-auto px-4 lg:px-10">
          <FuelStation />
        </div>
      </section>

      {/* ================= WHY US ================= */}
      <section className="py-20 bg-slate-50 overflow-hidden">
        <div className="max-w-[1480px] mx-auto px-4 lg:px-10 grid lg:grid-cols-2 gap-14 items-center">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-700">Why Lanka Auto Care</p>
            <h2 className="mt-3 text-3xl md:text-5xl font-black tracking-tight text-slate-900">Your car, always in view.</h2>
            <span className="mt-5 block h-1 w-24 rounded-full bg-gradient-to-r from-rose-600 to-rose-500" aria-hidden="true" />
            <p className="mt-5 text-slate-600 max-w-xl">Everything about your service — the booking, the progress, the bill and your rewards — in one place on your phone.</p>
            <div className="mt-8 grid sm:grid-cols-2 gap-5">
              {WHY.map((w, i) => (
                <Reveal key={w.title} delay={i * 100}>
                  <div className="group h-full rounded-2xl bg-white p-5 ring-1 ring-slate-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/10 hover:ring-blue-200">
                    <span className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center transition-colors group-hover:bg-blue-700 group-hover:text-white">
                      <Icon d={w.icon} className="w-5 h-5" />
                    </span>
                    <h3 className="mt-4 font-black text-slate-900">{w.title}</h3>
                    <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{w.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </Reveal>
          <Reveal delay={200}><PhoneMock /></Reveal>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="relative py-20 bg-[#0a1430] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] bg-[size:22px_22px]" aria-hidden="true" />
        <div className="relative max-w-[1480px] mx-auto px-4 lg:px-10">
          <SectionTitle eyebrow="Simple from start to finish" title="How It Works" light />
          <div ref={stepsRef} className="relative grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            <div className={`hidden lg:block absolute top-10 left-[12%] right-[12%] h-0.5 origin-left bg-gradient-to-r from-blue-500 via-sky-400 to-rose-500 opacity-60 transition-transform duration-[1800ms] ease-out ${stepsInView ? "scale-x-100" : "scale-x-0"}`} aria-hidden="true" />
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 150} className="relative text-center">
                <div className="relative mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 ring-4 ring-[#0a1430] flex items-center justify-center shadow-xl shadow-blue-950/50 transition-transform duration-300 hover:-translate-y-1 hover:rotate-3">
                  <Icon d={s.icon} className="w-9 h-9" />
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-rose-600 text-xs font-black flex items-center justify-center">{i + 1}</span>
                </div>
                <h3 className="mt-5 text-xl font-black">{s.title}</h3>
                <p className="mt-2 text-slate-300 text-sm leading-relaxed max-w-[16rem] mx-auto">{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= REWARDS ================= */}
      <section className="py-20 bg-white">
        <div className="max-w-[1480px] mx-auto px-4 lg:px-10">
          <SectionTitle eyebrow="Lanka Auto Rewards" title="Service more, save more" sub="Earn points on every paid bill, redeem them against your next one, and climb the tiers as your lifetime points grow." />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TIERS.map((t, i) => (
              <Reveal key={t.name} delay={i * 100}>
                <div className="group relative h-full overflow-hidden rounded-2xl ring-1 ring-slate-200 bg-white transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-slate-900/15">
                  <div className={`relative h-36 bg-gradient-to-br ${t.tone} p-5 flex flex-col justify-between overflow-hidden`}>
                    <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 home-sweep" style={{ animationDelay: `${i * 0.6}s` }} aria-hidden="true" />
                    <span className="relative flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/90">Member card</span>
                      <Icon d={ICON.star} className="w-6 h-6 text-white" />
                    </span>
                    <span className="relative text-2xl font-black text-white drop-shadow">{t.name}</span>
                  </div>
                  <p className="p-5 text-sm text-slate-600 leading-relaxed">{t.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href={user ? "/customers/profile" : "/register"} className="group inline-flex items-center gap-2 rounded-full bg-rose-600 hover:bg-rose-500 px-7 py-3.5 font-bold text-white transition-all hover:-translate-y-0.5">
              {user ? "View my rewards" : "Join free & start earning"} <Icon d={ICON.arrow} className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* ================= BRANDS ================= */}
      <section className="py-14 bg-slate-100 overflow-hidden">
        <Reveal className="text-center mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-700">All makes & models</p>
          <h2 className="mt-2 text-2xl md:text-3xl font-black text-slate-900">Brands we service</h2>
        </Reveal>
        <div className="relative [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <div className="home-marquee flex w-max py-2">
            {[...BRANDS, ...BRANDS].map((b, i) => (
              <span key={i} aria-hidden={i >= BRANDS.length} title={b.name}
                className="group shrink-0 mr-6 w-44 h-28 rounded-2xl bg-white ring-1 ring-slate-200 flex items-center justify-center transition-all duration-300 hover:ring-slate-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/10">
                <span className="flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                  <SmartImage src={`/brands/${b.file}.png`} alt={b.name} className="max-h-16 max-w-[7.5rem] object-contain" />
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FAQ + VISIT ================= */}
      <section className="py-20 bg-white">
        <div className="max-w-[1480px] mx-auto px-4 lg:px-10 grid lg:grid-cols-[1.3fr_1fr] gap-10">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-700">Questions</p>
            <h2 className="mt-3 text-3xl md:text-4xl font-black tracking-tight text-slate-900">Frequently asked</h2>
            <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
              {FAQS.map((f, i) => {
                const open = openFaq === i;
                return (
                  <div key={f.q}>
                    <button type="button" onClick={() => setOpenFaq(open ? null : i)} aria-expanded={open}
                      className="w-full flex items-center justify-between gap-4 py-5 text-left font-bold text-slate-900 hover:text-blue-700 transition-colors">
                      {f.q}
                      <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-all duration-300 ${open ? "bg-rose-600 text-white rotate-180" : "bg-slate-100 text-slate-600"}`}>
                        <Icon d={ICON.chevron} className="w-4 h-4" />
                      </span>
                    </button>
                    <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                      <p className="overflow-hidden text-slate-600 leading-relaxed">
                        <span className="block pb-5">{f.a}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="relative h-full overflow-hidden rounded-3xl bg-[#0a1430] text-white p-8">
              {/* stylised map */}
              <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <g stroke="#3b82f6" strokeWidth="1" fill="none">
                  {Array.from({ length: 10 }).map((_, i) => <line key={`h${i}`} x1="0" y1={i * 44} x2="400" y2={i * 44 + 20} />)}
                  {Array.from({ length: 10 }).map((_, i) => <line key={`v${i}`} x1={i * 44} y1="0" x2={i * 44 - 30} y2="400" />)}
                </g>
                <path d="M0 250 C120 230 220 180 400 120" stroke="#f43f5e" strokeWidth="5" fill="none" />
              </svg>
              <SmartImage src="/images/service-fuel.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a1430] via-[#0a1430]/90 to-[#0a1430]/60" aria-hidden="true" />
              <div className="relative">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Visit us</p>
                <h3 className="mt-3 text-2xl font-black">Lanka Auto Care, Malabe</h3>
                <div className="mt-6 flex items-center gap-3">
                  <span className="relative w-12 h-12 rounded-2xl bg-rose-600 flex items-center justify-center">
                    <span className="absolute inset-0 rounded-2xl bg-rose-500 home-ping" aria-hidden="true" />
                    <Icon d={ICON.pin} className="relative w-6 h-6" />
                  </span>
                  <p className="text-slate-200">{CONTACT.address}</p>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-slate-300">
                  <li className="flex items-center gap-3"><Icon d={ICON.clock} className="w-5 h-5 text-blue-300" /> Workshop: Mon–Sat, 8:00 am – 6:00 pm</li>
                  <li className="flex items-center gap-3"><Icon d={ICON.fuel} className="w-5 h-5 text-blue-300" /> Fuel station: open 24 hours</li>
                  <li className="flex items-center gap-3"><Icon d={ICON.mail} className="w-5 h-5 text-blue-300" /> <a href={`mailto:${CONTACT.email}`} className="hover:text-white break-all">{CONTACT.email}</a></li>
                </ul>
                <div className="mt-8 flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-3">
                  <a href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 px-6 py-3 font-bold transition-all hover:-translate-y-0.5">
                    <WhatsAppIcon className="w-5 h-5" /> WhatsApp us
                  </a>
                  <a href={CONTACT.phoneHref} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 hover:bg-white/10 px-6 py-3 font-bold transition-colors">
                    <Icon d={ICON.phone} className="w-5 h-5" /> {CONTACT.phone}
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= CALL TO ACTION ================= */}
      <section className="pb-16 bg-white">
        <div className="max-w-[1480px] mx-auto px-4 lg:px-10">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-700 via-rose-600 to-rose-700 px-8 py-12 md:px-16 text-white">
              <span className="absolute inset-y-0 -left-1/4 w-1/4 bg-gradient-to-r from-transparent via-white/15 to-transparent home-sweep" aria-hidden="true" />
              <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full border-[28px] border-white/10" aria-hidden="true" />
              <div className="relative grid md:grid-cols-[1fr_auto] gap-8 items-center">
                <div>
                  <h2 className="text-3xl md:text-4xl font-black tracking-tight">Ready when you are.</h2>
                  <p className="mt-3 text-rose-100 max-w-xl">Book your next service online in under a minute, or message us on WhatsApp — we reply during workshop hours.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href={primary.href} className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-rose-700 hover:bg-rose-50 px-7 py-4 font-bold transition-all hover:-translate-y-0.5">
                    {primary.label} <Icon d={ICON.arrow} className="w-5 h-5" />
                  </Link>
                  <a href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/40 hover:bg-white/10 px-7 py-4 font-bold transition-colors">
                    <WhatsAppIcon className="w-5 h-5" /> {CONTACT.phone}
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Floating WhatsApp button */}
      <a href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label={`Chat with us on WhatsApp (${CONTACT.phone})`}
        className="group fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-[#25D366] text-white shadow-xl shadow-emerald-900/30 flex items-center justify-center transition-transform hover:scale-110">
        <span className="absolute inset-0 rounded-full bg-[#25D366] home-ping" aria-hidden="true" />
        <WhatsAppIcon className="relative w-7 h-7" />
        <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white opacity-0 translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0">
          Chat on WhatsApp · {CONTACT.phone}
        </span>
      </a>
    </div>
  );
}
