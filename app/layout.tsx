"use client";

import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "./context/AuthContext";

const inter = Inter({ subsets: ["latin"] });

function NavigationBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getNavLinks = () => {
    if (!user) return [];

    const links = user.role !== "CUSTOMER" ? [{ name: "Dashboard", href: "/dashboard" }] : [];

    switch (user.role) {
      case "INVENTORY_MANAGER":
        links.push(
          { name: "Retail POS", href: "/pos" },
          { name: "Parts Catalog", href: "/parts" },
          { name: "Deliveries", href: "/deliveries" }
        );
        break;
      case "ACCOUNTS_FINANCE_OFFICER":
        links.push(
          { name: "Payables", href: "/payables" },
          { name: "Payroll", href: "/salary" }
        );
        break;
      case "SERVICE_CENTER_MANAGER":
      case "TECHNICIAN":
        links.push(
          { name: "Job Cards", href: "/bookings" }
        );
        break;
      case "FUEL_STATION_SUPERVISOR":
        links.push(
          { name: "Fuel Tanks", href: "/tanks" },
          { name: "Pump Sales", href: "/fuel" }
        );
        break;
      case "CUSTOMER_RELATIONS_OFFICER": // NEW: CRM Role Links
        links.push(
          { name: "Support Tickets", href: "/complaints" },
          { name: "Customers", href: "/customers" }
        );
        break;
      case "SUPER_ADMIN":
      case "EXECUTIVE_OWNER":
      case "SYSTEM_ADMIN":
        links.push(
          { name: "Retail POS", href: "/pos" },
          { name: "Payables", href: "/payables" },
          { name: "Users", href: "/users" }
        );
        break;
      case "CUSTOMER":
        links.push(
          { name: "My Garage", href: "/customers/dashboard" },
          { name: "Support", href: "/support" }
        );
        break;
    }
    return links;
  };

  const navLinks = getNavLinks();

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm transition-all duration-300">
      <div className="w-full px-4 lg:px-8 h-[72px] flex items-center justify-between gap-6">

        {/* --- BRANDING LOGO --- */}
        <Link href="/" className="flex items-center gap-3 group shrink-0">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-900/20 group-hover:bg-blue-600 transition-all duration-500 transform group-hover:scale-105 group-hover:rotate-3">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div className="flex items-center whitespace-nowrap pt-1">
            <span className="text-xl font-black tracking-tighter text-slate-900 group-hover:text-blue-700 transition-colors">LANKA</span>
            <span className="text-xl font-light tracking-tight text-slate-500 ml-1 group-hover:text-slate-700 transition-colors">AUTO</span>
            <span className="text-[10px] font-black text-blue-600 tracking-[0.2em] uppercase ml-2 border-l-2 border-slate-300 pl-2">Care</span>
          </div>
        </Link>

        {/* --- DYNAMIC RBAC NAVIGATION --- */}
        {user && (
          <nav className="hidden lg:flex items-center gap-2 overflow-x-auto no-scrollbar mask-edges pb-1 pt-1 flex-1 justify-center">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (pathname.startsWith(link.href) && link.href !== '/');
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`text-sm font-bold transition-all duration-300 px-4 py-2.5 rounded-xl whitespace-nowrap relative group ${
                    isActive ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  {link.name}
                  {!isActive && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-blue-600 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-50 group-hover:scale-100"></span>
                  )}
                </Link>
              );
            })}
          </nav>
        )}

        {/* --- AUTHENTICATION UI --- */}
        <div className="flex items-center justify-end shrink-0 min-w-[200px]">
          {user ? (
            <div className="flex items-center gap-2 lg:gap-4">
              <div className="flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-full border border-slate-200 bg-white shadow-sm max-w-[220px]">
                <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 text-white flex items-center justify-center text-xs font-bold shadow-inner">
                  {getInitials(user.username)}
                </div>
                <div className="flex flex-col text-left overflow-hidden">
                  <span className="text-sm font-bold text-slate-800 leading-tight truncate">{user.username}</span>
                  <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest leading-tight truncate">{user.role.replace(/_/g, ' ')}</span>
                </div>
              </div>
              <button onClick={logout} className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all shrink-0" title="Sign Out">
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                 </svg>
              </button>
            </div>
          ) : (
             <div className="flex items-center gap-3 shrink-0">
              <Link href="/login" className="text-sm font-bold text-slate-600 hover:text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-50/80 transition-all whitespace-nowrap">
                Sign In
              </Link>
              <Link href="/register" className="text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-xl shadow-md shadow-blue-600/20 whitespace-nowrap transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0">
                Get Started
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 text-slate-900 min-h-screen flex flex-col`}>
        <AuthProvider>
          <NavigationBar />
          <main className="flex-1 relative">
            <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none"></div>
            <div className="relative z-10">{children}</div>
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}