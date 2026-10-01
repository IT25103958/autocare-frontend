"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../../utils/axiosInstance";
import SiteFooter from "./SiteFooter";

// ---------------------------------------------------------------------------
// Navigation model. Each role gets sections (menus) of related pages. The header
// shows them two ways: every page as a quick link on row 2 (overflow goes into
// "More"), and grouped in the "All Sections" panel / mobile menu.
// ---------------------------------------------------------------------------

type IconName =
  | "dashboard" | "pos" | "billing" | "payables" | "payroll" | "suppliers" | "fuel" | "tank" | "truck"
  | "rma" | "ticket" | "roster" | "payslip" | "users" | "shield" | "wrench" | "box" | "customers"
  | "star" | "garage" | "support" | "calendar" | "finance" | "briefcase" | "settings";

interface NavLink { name: string; href: string; icon: IconName; hint: string }
type NavItem =
  | { kind: "link"; link: NavLink }
  | { kind: "menu"; title: string; icon: IconName; links: NavLink[] };

const L = {
  dashboard: { name: "Dashboard", href: "/dashboard", icon: "dashboard", hint: "Your overview" },
  pos: { name: "Retail POS", href: "/pos", icon: "pos", hint: "Counter sales & receipts" },
  billing: { name: "Billing", href: "/billing", icon: "billing", hint: "Invoices, receivables & day close" },
  payables: { name: "Payables", href: "/payables", icon: "payables", hint: "Supplier bills & debt" },
  expenses: { name: "Expenses", href: "/expenses", icon: "payables", hint: "Daily running costs" },
  payroll: { name: "Payroll", href: "/salary", icon: "payroll", hint: "Salaries & payslips" },
  suppliers: { name: "Suppliers", href: "/suppliers", icon: "suppliers", hint: "Supplier records & logins" },
  tanks: { name: "Wet Stock", href: "/tanks", icon: "tank", hint: "Tank levels, dips & prices" },
  fuelDeliveries: { name: "Fuel Deliveries", href: "/fuel-deliveries", icon: "truck", hint: "Fuel orders & receipts" },
  pumpSales: { name: "Pump Sales", href: "/fuel", icon: "fuel", hint: "Pumps, sales & shifts" },
  jobCards: { name: "Job Cards", href: "/bookings", icon: "wrench", hint: "Bookings & workshop jobs" },
  parts: { name: "Parts Catalog", href: "/parts", icon: "box", hint: "Stock, reorders & history" },
  deliveries: { name: "Deliveries", href: "/deliveries", icon: "truck", hint: "Parts purchase orders" },
  rma: { name: "Returns (RMA)", href: "/rma", icon: "rma", hint: "Defective parts & refunds" },
  warranty: { name: "Warranty Claims", href: "/warranty", icon: "shield", hint: "Verify, replace or refund" },
  reports: { name: "Reports", href: "/reports", icon: "billing", hint: "PDF & Excel exports" },
  tickets: { name: "Support Tickets", href: "/complaints", icon: "ticket", hint: "Customer complaints desk" },
  customers: { name: "Customers", href: "/customers", icon: "customers", hint: "Profiles & service history" },
  membership: { name: "Membership", href: "/membership", icon: "star", hint: "Loyalty points & tiers" },
  roster: { name: "Staff Roster", href: "/roster", icon: "roster", hint: "Shifts, attendance & leave" },
  myShifts: { name: "My Shifts", href: "/roster", icon: "calendar", hint: "Clock in, shifts & leave" },
  myPayslips: { name: "My Payslips", href: "/salary/my-payslips", icon: "payslip", hint: "Your pay history" },
  users: { name: "Users", href: "/users", icon: "users", hint: "Accounts & roles" },
  audit: { name: "Security Logs", href: "/audit", icon: "shield", hint: "Audit trail" },
} satisfies Record<string, NavLink>;

const named = (link: NavLink, name: string, hint?: string): NavLink => ({ ...link, name, hint: hint ?? link.hint });
const link = (l: NavLink): NavItem => ({ kind: "link", link: l });
const menu = (title: string, icon: IconName, links: NavLink[]): NavItem =>
  links.length === 1 ? link(links[0]) : { kind: "menu", title, icon, links };

function navFor(role: string, supplierCategories: string[]): NavItem[] {
  const dash = link(L.dashboard);
  const myWork = (...links: NavLink[]) => menu("My Work", "briefcase", links);

  switch (role) {
    case "SUPER_ADMIN":
    case "SYSTEM_ADMIN":
    case "EXECUTIVE_OWNER":
      return [
        dash,
        menu("Sales & Finance", "finance", [L.pos, L.billing, L.payables, L.expenses, L.payroll, L.reports, L.suppliers]),
        menu("Operations", "wrench", [L.jobCards, L.pumpSales, L.tanks, L.fuelDeliveries]),
        menu("Inventory", "box", [L.parts, L.deliveries, L.rma, L.warranty]),
        menu("Customers", "customers", [L.customers, L.membership, L.tickets]),
        menu("Admin", "settings", [L.roster, L.users, L.audit]),
      ];
    case "ACCOUNTS_FINANCE_OFFICER":
      return [
        dash,
        menu("Finance", "finance", [L.billing, L.payables, L.expenses, L.payroll, L.reports, L.suppliers]),
        menu("Fuel Station", "fuel", [L.tanks, L.fuelDeliveries]),
        menu("Returns & Support", "ticket", [L.warranty, named(L.rma, "Refunds (RMA)"), L.tickets]),
        myWork(named(L.roster, "Roster", "Shifts & attendance (read-only)"), L.myPayslips),
      ];
    case "SERVICE_CENTER_MANAGER":
      return [
        dash,
        menu("Workshop", "wrench", [L.jobCards, named(L.roster, "Technician Roster", "Technician shifts, bays & leave")]),
        link(L.tickets),
        myWork(L.myPayslips),
      ];
    case "TECHNICIAN":
      return [dash, link(L.jobCards), myWork(L.myShifts, L.myPayslips)];
    case "FUEL_STATION_SUPERVISOR":
      return [
        dash,
        menu("Fuel Station", "fuel", [L.pumpSales, L.tanks, L.fuelDeliveries, named(L.suppliers, "Fuel Suppliers", "Fuel supplier records")]),
        link(named(L.roster, "Forecourt Roster", "Attendant shifts, pumps & leave")),
        link(L.tickets),
        myWork(L.myPayslips),
      ];
    case "FUEL_ATTENDANT":
      return [dash, link(L.pumpSales), myWork(L.myShifts, L.myPayslips)];
    case "INVENTORY_MANAGER":
      return [
        dash,
        link(L.pos),
        menu("Inventory", "box", [L.parts, L.deliveries, named(L.suppliers, "Parts Suppliers", "Parts supplier records"), L.rma, L.warranty]),
        myWork(L.myShifts, L.myPayslips),
      ];
    case "CUSTOMER_RELATIONS_OFFICER":
      return [dash, menu("Customers", "customers", [L.tickets, L.customers, L.membership]), myWork(L.myShifts, L.myPayslips)];
    case "SUPPLIER": {
      const links: NavLink[] = [];
      if (supplierCategories.includes("SPARE_PARTS")) links.push(named(L.deliveries, "Parts Orders", "Orders to dispatch"), L.rma);
      if (supplierCategories.includes("FUEL")) links.push(named(L.fuelDeliveries, "Fuel Orders", "Fuel orders to dispatch"));
      return [dash, ...links.map(link)];
    }
    case "CUSTOMER":
      return [
        link({ name: "My Garage", href: "/customers/dashboard", icon: "garage", hint: "Vehicles, bills & bookings" }),
        link({ name: "Book a Service", href: "/customers/book", icon: "calendar", hint: "New appointment" }),
        link({ name: "Support", href: "/support", icon: "support", hint: "Get help" }),
        link({ name: "My Account", href: "/customers/profile", icon: "star", hint: "Profile & rewards" }),
      ];
    default:
      return [];
  }
}

const linksOf = (item: NavItem) => (item.kind === "link" ? [item.link] : item.links);

// Every page once (row 2 quick links and search), with the section it belongs to.
function flatten(items: NavItem[]) {
  const seen = new Set<string>();
  const out: (NavLink & { section: string })[] = [];
  for (const item of items) {
    for (const l of linksOf(item)) {
      const key = l.href + l.name;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...l, section: item.kind === "menu" ? item.title : "General" });
    }
  }
  return out;
}

// The single most specific link matching the path (so /salary/my-payslips
// doesn't also light up /salary).
function activeHref(pathname: string, links: NavLink[]) {
  return links
    .filter(l => pathname === l.href || pathname.startsWith(l.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

const roleLabel = (role: string) => role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const initials = (name: string) => {
  const parts = name.trim().split(/[\s_]+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.substring(0, 2)).toUpperCase();
};

// ---------------------------------------------------------------------------
// Icons (24x24 outline)
// ---------------------------------------------------------------------------

const ICONS: Record<string, string> = {
  dashboard: "M4 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm9 0a1 1 0 011-1h5a1 1 0 011 1v3a1 1 0 01-1 1h-5a1 1 0 01-1-1V5zm0 7a1 1 0 011-1h5a1 1 0 011 1v7a1 1 0 01-1 1h-5a1 1 0 01-1-1v-7zm-9 2a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5z",
  pos: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
  billing: "M9 14l2 2 4-4M7 3h10a2 2 0 012 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 012-2z",
  payables: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
  payroll: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  finance: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  suppliers: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  fuel: "M3 21V5a2 2 0 012-2h7a2 2 0 012 2v16M3 21h11M6 8h5m3 3h2a2 2 0 012 2v4a1.5 1.5 0 003 0V9l-3-3",
  tank: "M12 3c3.866 0 7 1.343 7 3v12c0 1.657-3.134 3-7 3s-7-1.343-7-3V6c0-1.657 3.134-3 7-3zm-7 3c0 1.657 3.134 3 7 3s7-1.343 7-3M5 12c0 1.657 3.134 3 7 3s7-1.343 7-3",
  truck: "M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1",
  rma: "M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6",
  ticket: "M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z",
  roster: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  payslip: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  users: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
  shield: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  wrench: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  box: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  customers: "M17 20h5v-2a3 3 0 00-5.356-1.857M9 20H4v-2a3 3 0 015.356-1.857M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  star: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
  garage: "M3 12l9-8 9 8M5 10v10h14V10M9 20v-6h6v6",
  support: "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  briefcase: "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  settings: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 18L18 6M6 6l12 12",
  logout: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  chevron: "M19 9l-7 7-7-7",
  key: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  search: "M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z",
  grid: "M4 6h16M4 12h16M4 18h7",
  arrow: "M14 5l7 7m0 0l-7 7m7-7H3",
};

function Icon({ name, className = "w-5 h-5", strokeWidth = 1.8 }: { name: string; className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[name]} />
    </svg>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Lanka Auto Care home">
      <span className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center transition-colors duration-300 group-hover:bg-blue-700">
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </span>
      <span className="hidden sm:block leading-none">
        <span className="block text-[22px] font-black tracking-tight text-slate-900">Lanka<span className="text-blue-700">Auto</span></span>
        <span className="block text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 mt-0.5">Care · Malabe</span>
      </span>
    </Link>
  );
}

// Close on outside click / Esc.
function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close, ref]);
}

// ---------------------------------------------------------------------------
// Row 1: page search
// ---------------------------------------------------------------------------

function PageSearch({ pages }: { pages: (NavLink & { section: string })[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const close = useMemo(() => () => setOpen(false), []);
  useDismiss(open, close, ref);

  const q = query.trim().toLowerCase();
  const results = q
    ? pages.filter(p => `${p.name} ${p.hint} ${p.section}`.toLowerCase().includes(q)).slice(0, 7)
    : pages.slice(0, 7);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setCursor(c => Math.min(c + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && results[cursor]) { e.preventDefault(); go(results[cursor].href); }
  };

  return (
    <div ref={ref} className="relative w-full">
      <form role="search" onSubmit={e => { e.preventDefault(); if (results[cursor]) go(results[cursor].href); }}
        className={`flex items-center h-11 rounded-full border-2 bg-white pl-5 pr-1 transition-colors ${open ? "border-blue-600" : "border-slate-900"}`}>
        <input value={query} onChange={e => { setQuery(e.target.value); setOpen(true); setCursor(0); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          placeholder="Search pages — billing, roster, parts…" aria-label="Search pages" aria-expanded={open} aria-controls="page-search-results" role="combobox" aria-autocomplete="list"
          className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none" />
        <button type="submit" aria-label="Go" className="w-14 h-8 rounded-full bg-slate-900 hover:bg-blue-700 text-white flex items-center justify-center transition-colors">
          <Icon name="search" className="w-[18px] h-[18px]" strokeWidth={2.4} />
        </button>
      </form>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-[70]">
          <ul id="page-search-results" role="listbox" className="nav-pop rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-slate-900/10 p-2">
            {results.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No pages match “{query}”.</li>}
            {results.map((p, i) => (
              <li key={p.href + p.name} role="option" aria-selected={i === cursor}>
                <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => go(p.href)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${i === cursor ? "bg-slate-100" : ""}`}>
                  <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0"><Icon name={p.icon} className="w-[18px] h-[18px]" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{p.name}</span>
                    <span className="block text-xs text-slate-500 truncate">{p.hint}</span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden sm:block">{p.section}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row 1: account + sign out
// ---------------------------------------------------------------------------

function AccountMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const close = useMemo(() => () => setOpen(false), []);
  useDismiss(open, close, ref);
  useEffect(() => { setOpen(false); }, [pathname]);
  if (!user) return null;
  const name = user.fullName || user.username;

  return (
    <div ref={ref} className="relative hidden md:block">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <Icon name="user" className="w-7 h-7 text-slate-800" strokeWidth={1.6} />
        <span className="leading-tight">
          <span className="block text-xs text-slate-500">Welcome,</span>
          <span className="flex items-center gap-1 text-sm font-bold text-slate-900 max-w-[150px]">
            <span className="truncate">{name}</span>
            <Icon name="chevron" strokeWidth={2.5} className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full pt-2 z-[70]">
          <div role="menu" className="nav-pop w-64 rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-slate-900/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-bold">{initials(name)}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900 truncate">{name}</span>
                <span className="block text-[11px] font-semibold text-blue-700 truncate">{roleLabel(user.role)}</span>
              </span>
            </div>
            <div className="p-1.5">
              {user.role === "CUSTOMER" && (
                <Link href="/customers/profile" role="menuitem" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Icon name="user" className="w-4 h-4 text-slate-500" /> My Account
                </Link>
              )}
              <Link href="/change-password" role="menuitem" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Icon name="key" className="w-4 h-4 text-slate-500" /> Change Password
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SignOutButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Sign out"
      className="group flex items-center gap-2 h-10 px-3 sm:px-4 rounded-full border border-slate-200 text-sm font-bold text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-red-500">
      <Icon name="logout" className="w-[18px] h-[18px] transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Row 2: "All Sections" panel + quick links with measured "More" overflow
// ---------------------------------------------------------------------------

function AllSectionsPanel({ items, current, onPick }: { items: NavItem[]; current?: string; onPick: () => void }) {
  const general = items.filter(i => i.kind === "link").map(i => (i as { link: NavLink }).link);
  const sections = [
    ...(general.length ? [{ title: "General", links: general }] : []),
    ...items.filter(i => i.kind === "menu").map(i => ({ title: (i as { title: string }).title, links: (i as { links: NavLink[] }).links })),
  ];
  return (
    <div className="absolute left-0 top-full pt-2 z-[70]">
      <div className="nav-pop rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-slate-900/10 p-5 w-[min(92vw,56rem)]">
        <div className="grid gap-x-8 gap-y-6" style={{ gridTemplateColumns: `repeat(${Math.min(sections.length, 3)}, minmax(0, 1fr))` }}>
          {sections.map((s, si) => (
            <div key={s.title} className="nav-fade-up" style={{ animationDelay: `${si * 40}ms` }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-2">{s.title}</p>
              <ul className="space-y-0.5">
                {s.links.map(l => {
                  const active = l.href === current;
                  return (
                    <li key={l.href + l.name}>
                      <Link href={l.href} onClick={onPick} aria-current={active ? "page" : undefined}
                        className={`group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${active ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white"}`}>
                          <Icon name={l.icon} className="w-[18px] h-[18px]" />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold ${active ? "text-blue-700" : "text-slate-900"}`}>{l.name}</span>
                          <span className="block text-xs text-slate-500 truncate">{l.hint}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryRow({ items, pages, current }: { items: NavItem[]; pages: (NavLink & { section: string })[]; current?: string }) {
  const [panel, setPanel] = useState<"all" | "more" | null>(null);
  const [visible, setVisible] = useState(pages.length);
  const rowRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const close = useMemo(() => () => setPanel(null), []);
  useDismiss(panel !== null, close, rowRef);
  useEffect(() => { setPanel(null); }, [pathname]);

  // Show as many quick links as fit; the rest go into "More". Measured from a
  // hidden copy so the visible row never overlaps or wraps.
  useLayoutEffect(() => {
    const container = linksRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const MORE_WIDTH = 96;
    const compute = () => {
      const widths = Array.from(measure.children).map(c => (c as HTMLElement).offsetWidth);
      const available = container.clientWidth;
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= available) { setVisible(widths.length); return; }
      let used = 0, count = 0;
      for (const w of widths) {
        if (used + w > available - MORE_WIDTH) break;
        used += w;
        count++;
      }
      setVisible(count);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [pages]);

  const shown = pages.slice(0, visible);
  const overflow = pages.slice(visible);
  const linkClass = (active: boolean) =>
    `relative shrink-0 px-3.5 py-2 text-[15px] whitespace-nowrap transition-colors ${active ? "text-blue-700 font-semibold" : "text-slate-700 hover:text-slate-950"}`;

  return (
    <div ref={rowRef} className="hidden lg:flex items-center gap-6 h-14">
      {/* All sections */}
      <div className="relative shrink-0">
        <button type="button" onClick={() => setPanel(panel === "all" ? null : "all")} aria-haspopup="true" aria-expanded={panel === "all"}
          className={`flex items-center gap-3 h-11 w-64 px-4 rounded-full text-[15px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${panel === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900 hover:bg-slate-200"}`}>
          <Icon name={panel === "all" ? "close" : "menu"} className="w-5 h-5" strokeWidth={2} />
          All Sections
        </button>
        {panel === "all" && <AllSectionsPanel items={items} current={current} onPick={() => setPanel(null)} />}
      </div>

      {/* Quick links */}
      <div ref={linksRef} className="relative flex-1 min-w-0 flex items-center">
        <div ref={measureRef} className="absolute invisible pointer-events-none flex" aria-hidden="true">
          {pages.map(p => <span key={p.href + p.name} className={linkClass(false)}>{p.name}</span>)}
        </div>

        <nav aria-label="Pages" className="flex items-center">
          {shown.map(p => {
            const active = p.href === current;
            return (
              <Link key={p.href + p.name} href={p.href} aria-current={active ? "page" : undefined} className={`group ${linkClass(active)}`}>
                {p.name}
                <span className={`absolute left-3.5 right-3.5 -bottom-0.5 h-[2px] rounded-full bg-current origin-left transition-transform duration-300 ${active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`} aria-hidden="true" />
              </Link>
            );
          })}

          {overflow.length > 0 && (
            <div className="relative shrink-0">
              <button type="button" onClick={() => setPanel(panel === "more" ? null : "more")} aria-haspopup="menu" aria-expanded={panel === "more"}
                className={`flex items-center gap-1 px-3.5 py-2 text-[15px] transition-colors ${overflow.some(p => p.href === current) ? "text-blue-700 font-semibold" : "text-slate-700 hover:text-slate-950"}`}>
                More
                <Icon name="chevron" strokeWidth={2.5} className={`w-4 h-4 transition-transform duration-200 ${panel === "more" ? "rotate-180" : ""}`} />
              </button>
              {panel === "more" && (
                <div className="absolute right-0 top-full pt-2 z-[70]">
                  <div role="menu" className="nav-pop w-72 rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-slate-900/10 p-1.5">
                    {overflow.map(p => (
                      <Link key={p.href + p.name} href={p.href} role="menuitem" onClick={() => setPanel(null)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${p.href === current ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                        <Icon name={p.icon} className="w-[18px] h-[18px] text-slate-500" />
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold ${p.href === current ? "text-blue-700" : "text-slate-900"}`}>{p.name}</span>
                          <span className="block text-xs text-slate-500 truncate">{p.hint}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile menu: slide-in panel with accordion sections
// ---------------------------------------------------------------------------

function MobileMenu({ items, current, onClose, onLogout }: { items: NavItem[]; current?: string; onClose: () => void; onLogout: () => void }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(() => {
    const section = items.find(i => i.kind === "menu" && i.links.some(l => l.href === current));
    return section?.kind === "menu" ? section.title : null;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const row = (l: NavLink, i: number, nested = false) => {
    const active = l.href === current;
    return (
      <Link key={l.href + l.name} href={l.href} onClick={onClose} aria-current={active ? "page" : undefined}
        style={{ animationDelay: `${i * 35}ms` }}
        className={`nav-fade-up flex items-center gap-3 rounded-xl ${nested ? "px-3 py-2.5" : "px-3 py-3"} text-sm font-semibold transition-colors ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-white/15" : "bg-slate-100"}`}>
          <Icon name={l.icon} className="w-5 h-5" />
        </span>
        <span className="min-w-0">
          <span className="block">{l.name}</span>
          <span className={`block text-xs font-normal truncate ${active ? "text-slate-300" : "text-slate-500"}`}>{l.hint}</span>
        </span>
      </Link>
    );
  };

  return (
    <div className="lg:hidden fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="nav-fade absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="nav-slide-in absolute inset-y-0 right-0 w-[88%] max-w-sm bg-white shadow-2xl flex flex-col">
        <div className="p-5 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Menu</span>
            <button onClick={onClose} aria-label="Close menu" className="p-2 -mr-2 rounded-xl hover:bg-slate-100">
              <Icon name="close" className="w-6 h-6" />
            </button>
          </div>
          {user && (
            <div className="mt-3 flex items-center gap-3">
              <span className="w-11 h-11 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">{initials(user.fullName || user.username)}</span>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">{user.fullName || user.username}</p>
                <p className="text-xs font-semibold text-blue-700 truncate">{roleLabel(user.role)}</p>
              </div>
            </div>
          )}
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto p-3 space-y-1">
          {items.map((item, i) => {
            if (item.kind === "link") return row(item.link, i);
            const isOpen = expanded === item.title;
            const active = item.links.some(l => l.href === current);
            return (
              <div key={item.title} style={{ animationDelay: `${i * 35}ms` }} className="nav-fade-up">
                <button type="button" onClick={() => setExpanded(isOpen ? null : item.title)} aria-expanded={isOpen}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-colors hover:bg-slate-100 ${active ? "text-blue-700" : "text-slate-800"}`}>
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-blue-50 text-blue-700" : "bg-slate-100"}`}>
                    <Icon name={item.icon} className="w-5 h-5" />
                  </span>
                  <span className="flex-1 text-left">{item.title}</span>
                  <Icon name="chevron" strokeWidth={2.5} className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <div className="pl-4 ml-7 border-l-2 border-slate-100 space-y-1 py-1">
                      {isOpen && item.links.map((l, j) => row(l, j, true))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-1">
          <Link href="/change-password" onClick={onClose} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <Icon name="key" className="w-5 h-5 text-slate-500" /> Change Password
          </Link>
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50">
            <Icon name="logout" className="w-5 h-5" /> Sign out
          </button>
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header + page shell
// ---------------------------------------------------------------------------

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Someone still on a temporary password can't use the app until they
  // choose their own (the backend enforces this too).
  useEffect(() => {
    if (user?.mustChangePassword && pathname !== "/change-password") {
      router.replace("/change-password");
    }
  }, [user, pathname, router]);

  // A supplier's menu depends on what its company supplies (fuel, spare parts or both).
  const [supplierCategories, setSupplierCategories] = useState<string[]>([]);
  useEffect(() => {
    if (user?.role !== "SUPPLIER") return;
    api.get<{ categories: string[] }>("/suppliers/me")
      .then(res => setSupplierCategories(res.data.categories))
      .catch(() => setSupplierCategories([]));
  }, [user]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const showNav = !!user && !user.mustChangePassword;
  const items = useMemo(() => (showNav ? navFor(user!.role, supplierCategories) : []), [showNav, user, supplierCategories]);
  const pages = useMemo(() => flatten(items), [items]);
  const current = activeHref(pathname, pages);

  return (
    <div className="min-h-screen flex flex-col">
      <header className={`sticky top-0 z-50 bg-white transition-shadow duration-300 ${scrolled ? "shadow-[0_6px_24px_-12px_rgba(15,23,42,0.25)]" : "border-b border-slate-200"}`}>
        <div className="max-w-[1480px] mx-auto px-4 lg:px-10">
          {/* Row 1: logo · search · account & sign out */}
          <div className="h-[72px] flex items-center gap-4 lg:gap-10">
            <Logo />

            {showNav && (
              <div className="hidden md:block flex-1 max-w-3xl">
                <PageSearch pages={pages} />
              </div>
            )}

            <div className="ml-auto flex items-center gap-2 lg:gap-4 shrink-0">
              {showNav ? (
                <>
                  <AccountMenu />
                  <SignOutButton onClick={logout} />
                  <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen}
                    className="lg:hidden w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center active:scale-95 transition-transform">
                    <Icon name="menu" className="w-5 h-5" strokeWidth={2} />
                  </button>
                </>
              ) : user ? null : (
                <>
                  <Link href="/login" className="hidden sm:flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors">
                    <Icon name="user" className="w-7 h-7 text-slate-800" strokeWidth={1.6} />
                    <span className="leading-tight">
                      <span className="block text-xs text-slate-500">Welcome</span>
                      <span className="block text-sm font-bold text-slate-900">Sign in / Register</span>
                    </span>
                  </Link>
                  <Link href="/login" className="sm:hidden text-sm font-bold text-slate-700 px-3 py-2">Sign in</Link>
                  <Link href="/register" className="h-10 px-5 rounded-full bg-slate-900 hover:bg-blue-700 text-white text-sm font-bold flex items-center transition-colors">Get Started</Link>
                </>
              )}
            </div>
          </div>

          {/* Mobile search */}
          {showNav && (
            <div className="md:hidden pb-3">
              <PageSearch pages={pages} />
            </div>
          )}

          {/* Row 2: all sections · quick links · more */}
          {showNav && <CategoryRow items={items} pages={pages} current={current} />}
        </div>
      </header>

      {mobileOpen && <MobileMenu items={items} current={current} onClose={() => setMobileOpen(false)} onLogout={logout} />}

      <main className="flex-1 relative">
        <div className="relative z-10">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}
