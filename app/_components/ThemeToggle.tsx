"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme, type ThemePreference } from "../context/ThemeContext";

const PATHS = {
  light: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
  dark: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z",
  system: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
};

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function ThemeIcon({ name, className = "w-5 h-5" }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={PATHS[name]} />
    </svg>
  );
}

// Header button: shows the theme in use, opens Light / Dark / System.
export default function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        aria-label={`Theme: ${preference === "system" ? `system (${resolved})` : preference}`} title="Change theme"
        className="relative w-10 h-10 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors overflow-hidden">
        {/* The sun sets and the moon rises when the theme changes */}
        <span className={`absolute transition-all duration-500 ${resolved === "dark" ? "-translate-y-8 rotate-90 opacity-0" : "translate-y-0 rotate-0 opacity-100"}`}>
          <ThemeIcon name="light" />
        </span>
        <span className={`absolute transition-all duration-500 ${resolved === "dark" ? "translate-y-0 rotate-0 opacity-100" : "translate-y-8 -rotate-90 opacity-0"}`}>
          <ThemeIcon name="dark" />
        </span>
      </button>

      {open && (
        <div role="menu" className="nav-pop absolute right-0 mt-2 w-44 rounded-2xl bg-white ring-1 ring-slate-200 shadow-xl shadow-slate-900/10 p-1.5 z-50">
          <p className="px-3 pt-1.5 pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Theme</p>
          {OPTIONS.map(o => {
            const active = preference === o.value;
            return (
              <button key={o.value} type="button" role="menuitemradio" aria-checked={active}
                onClick={() => { setPreference(o.value); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${active ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}>
                <ThemeIcon name={o.value} className="w-[18px] h-[18px]" />
                <span className="flex-1 text-left">{o.label}</span>
                {active && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
