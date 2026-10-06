"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";

// Light, dark, or follow the device. The choice is kept in localStorage; the
// inline script in layout.tsx applies it before the first paint so a dark
// page never flashes white on load.

export type ThemePreference = "light" | "dark" | "system";
const STORAGE_KEY = "theme";
const CHANGE_EVENT = "theme-preference";

// Runs in <head> before the page paints; keep it in step with apply() below.
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${STORAGE_KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(x){}})()`;

function readPreference(): ThemePreference {
  try {
    const p = localStorage.getItem(STORAGE_KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

// The saved choice: changes from this tab (CHANGE_EVENT) or another tab ("storage").
function subscribePreference(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// The device setting, for "system".
function subscribeSystem(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const systemIsDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function apply(dark: boolean) {
  const root = document.documentElement;
  if (root.classList.contains("dark") === dark) return;
  // Switch in one go instead of every transition on the page firing at once.
  root.classList.add("theme-switching");
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
}

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({ preference: "system", resolved: "light", setPreference: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The server can't know either value, so it assumes "system" / light; the
  // head script has already set the real theme on the page by then.
  const preference = useSyncExternalStore(subscribePreference, readPreference, () => "system" as const);
  const deviceDark = useSyncExternalStore(subscribeSystem, systemIsDark, () => false);
  const resolved = preference === "dark" || (preference === "system" && deviceDark) ? "dark" : "light";

  useEffect(() => { apply(resolved === "dark"); }, [resolved]);

  const setPreference = useCallback((p: ThemePreference) => {
    try {
      if (p === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // private mode: the choice just won't be remembered
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return <ThemeContext.Provider value={{ preference, resolved, setPreference }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
