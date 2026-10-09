"use client";

import Link from "next/link";
import { CONTACT, WhatsAppIcon } from "./contact";
import SmartImage from "./SmartImage";

const QUICK_LINKS = [
  { name: "Home", href: "/" },
  { name: "Book a Service", href: "/customers/book", highlight: true },
  { name: "My Garage & Bills", href: "/customers/dashboard" },
  { name: "Customer Support", href: "/support" },
  { name: "Create an Account", href: "/register" },
  { name: "Sign In", href: "/login" },
];

const SERVICES = ["Vehicle Servicing", "Mechanical Repair", "Computer Diagnostics", "Hybrid Battery Care", "Fuel Station (24h)", "Genuine Spare Parts"];

const PATH = {
  pin: "M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z",
  phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
  mail: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  arrow: "M9 5l7 7-7 7",
  up: "M5 15l7-7 7 7",
};

const Glyph = ({ d, className = "w-4 h-4" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold text-white">
      {children}
      <span className="mt-2 block h-0.5 w-10 rounded-full bg-rose-600" aria-hidden="true" />
    </h2>
  );
}

// Link with an arrow that slides in on hover.
function FooterLink({ href, children, highlight = false }: { href: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <Link href={href} className={`group inline-flex items-center transition-colors ${highlight ? "text-rose-500 hover:text-rose-400" : "text-slate-300 hover:text-white"}`}>
      <span className="w-0 overflow-hidden opacity-0 -translate-x-2 transition-all duration-300 group-hover:w-5 group-hover:opacity-100 group-hover:translate-x-0">
        <Glyph d={PATH.arrow} className="w-3.5 h-3.5 text-rose-500" />
      </span>
      {children}
    </Link>
  );
}

function ContactRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 w-8 h-8 shrink-0 rounded-lg bg-white/5 ring-1 ring-white/10 text-rose-500 flex items-center justify-center">{icon}</span>
      <span className="pt-1">{children}</span>
    </li>
  );
}

export default function SiteFooter() {
  return (
    <footer className="relative mt-12 overflow-hidden bg-[#05070d] text-slate-400">
      {/* Background: optional photo (public/images/footer.jpg), faded, plus a large watermark */}
      <SmartImage src="/images/footer.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#05070d] via-[#05070d]/95 to-[#05070d]/75" aria-hidden="true" />
      <svg className="absolute -right-24 -bottom-24 w-[34rem] h-[34rem] text-white/[0.03]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.6} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>

      <div className="relative max-w-[1480px] mx-auto px-4 lg:px-10 pt-16 pb-12 grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        {/* Brand */}
        <div>
          <Link href="/" className="group inline-flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600 to-rose-700 flex items-center justify-center shadow-lg shadow-rose-900/40 transition-transform duration-300 group-hover:-rotate-6">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </span>
            <span className="leading-none">
              <span className="block text-2xl font-black tracking-tight text-white">Lanka<span className="text-rose-500">Auto</span></span>
              <span className="block mt-1 text-[10px] font-bold uppercase tracking-[0.35em] text-slate-400">Care · Malabe</span>
            </span>
          </Link>
          <p className="mt-6 text-sm leading-relaxed max-w-sm">
            A complete vehicle service centre and 24-hour fuel station. Book online, follow your job live,
            pay your bill online and earn rewards on every visit.
          </p>
          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">Reach us</p>
            <div className="flex gap-2">
              {[
                { href: CONTACT.whatsappUrl, label: "WhatsApp", icon: <WhatsAppIcon className="w-4 h-4" />, hover: "hover:bg-[#25D366]", external: true },
                { href: CONTACT.phoneHref, label: "Call", icon: <Glyph d={PATH.phone} />, hover: "hover:bg-blue-600" },
                { href: `mailto:${CONTACT.email}`, label: "Email", icon: <Glyph d={PATH.mail} />, hover: "hover:bg-rose-600" },
              ].map(b => (
                <a key={b.label} href={b.href} aria-label={b.label} title={b.label}
                  {...(b.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={`w-10 h-10 rounded-lg bg-white/5 ring-1 ring-white/10 text-slate-200 hover:text-white hover:ring-transparent flex items-center justify-center transition-all duration-300 hover:-translate-y-1 ${b.hover}`}>
                  {b.icon}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div>
          <Heading>Quick Links</Heading>
          <ul className="mt-6 space-y-3 text-[15px]">
            {QUICK_LINKS.map(l => <li key={l.href}><FooterLink href={l.href} highlight={l.highlight}>{l.name}</FooterLink></li>)}
          </ul>
        </div>

        {/* Services */}
        <div>
          <Heading>Our Services</Heading>
          <ul className="mt-6 space-y-3 text-[15px]">
            {SERVICES.map(s => <li key={s}><FooterLink href="/customers/book">{s}</FooterLink></li>)}
          </ul>
        </div>

        {/* Find us */}
        <div>
          <Heading>Find Us</Heading>
          <ul className="mt-6 space-y-4 text-[15px] text-slate-300">
            <ContactRow icon={<Glyph d={PATH.pin} />}>{CONTACT.address}</ContactRow>
            <ContactRow icon={<WhatsAppIcon className="w-4 h-4" />}>
              <a href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">{CONTACT.phone}</a>
              <span className="block text-xs text-slate-500">Call or WhatsApp</span>
            </ContactRow>
            <ContactRow icon={<Glyph d={PATH.mail} />}>
              <a href={`mailto:${CONTACT.email}`} className="hover:text-white transition-colors break-all">{CONTACT.email}</a>
            </ContactRow>
            <ContactRow icon={<Glyph d={PATH.clock} />}>
              Workshop: Mon – Sat, 8:00 am – 6:00 pm
              <span className="block">Fuel station: open 24 hours</span>
            </ContactRow>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="relative border-t border-white/10">
        <div className="max-w-[1480px] mx-auto px-4 lg:px-10 py-6 pb-24 md:pb-6 md:pr-24 flex flex-col md:flex-row items-center gap-4">
          <p className="text-sm text-center md:text-left">
            © {new Date().getFullYear()} Lanka Auto Care (Pvt) Ltd. All rights reserved.
          </p>
          <p className="md:ml-auto text-sm text-center md:text-right">
            Designed &amp; Developed by <span className="font-bold text-white">D.Kezara</span>          </p>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top"
            className="w-10 h-10 shrink-0 rounded-lg bg-white/5 ring-1 ring-white/10 text-slate-200 hover:bg-rose-600 hover:text-white hover:ring-transparent flex items-center justify-center transition-all duration-300 hover:-translate-y-1">
            <Glyph d={PATH.up} />
          </button>
        </div>
      </div>
    </footer>
  );
}
