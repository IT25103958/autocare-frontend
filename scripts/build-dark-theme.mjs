// Writes app/dark-theme.css: dark-mode replacements for the light colour
// classes the pages use (bg-white, text-slate-900, border-slate-200, bg-blue-50 ...).
// The app was built light-only, so instead of adding `dark:` to thousands of
// class lists, this finds every such class in app/ and utils/ and gives it a
// dark value under html.dark.
//
// Run after adding pages or colours:   npm run theme:css
//
// The rules are plain (unlayered) CSS, so they beat Tailwind's utilities. That
// also means a `dark:` class on the same element loses to them — for those
// elements, change the light class instead.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- Dark values -----------------------------------------------------------

const NEUTRAL = {
  bg: { white: "#0f172a", 50: "#0a1120", 100: "#1e293b", 200: "#334155", 300: "#475569", 800: "#334155", 900: "#1e293b" },
  text: { 500: "#8b98ab", 600: "#a8b3c4", 700: "#cbd5e1", 800: "#e2e8f0", 900: "#f1f5f9", 950: "#f8fafc" },
  line: { white: "#0f172a", 50: "#1e293b", 100: "#1e293b", 200: "#273449", 300: "#334155", 400: "#475569", 800: "#cbd5e1", 900: "#cbd5e1" },
};

// Tailwind's 300 / 400 / 500 shades for each colour.
const COLORS = {
  red: ["#fca5a5", "#f87171", "#ef4444"], orange: ["#fdba74", "#fb923c", "#f97316"],
  amber: ["#fcd34d", "#fbbf24", "#f59e0b"], yellow: ["#fde047", "#facc15", "#eab308"],
  lime: ["#bef264", "#a3e635", "#84cc16"], green: ["#86efac", "#4ade80", "#22c55e"],
  emerald: ["#6ee7b7", "#34d399", "#10b981"], teal: ["#5eead4", "#2dd4bf", "#14b8a6"],
  cyan: ["#67e8f9", "#22d3ee", "#06b6d4"], sky: ["#7dd3fc", "#38bdf8", "#0ea5e9"],
  blue: ["#93c5fd", "#60a5fa", "#3b82f6"], indigo: ["#a5b4fc", "#818cf8", "#6366f1"],
  violet: ["#c4b5fd", "#a78bfa", "#8b5cf6"], purple: ["#d8b4fe", "#c084fc", "#a855f7"],
  fuchsia: ["#f0abfc", "#e879f9", "#d946ef"], pink: ["#f9a8d4", "#f472b6", "#ec4899"],
  rose: ["#fda4af", "#fb7185", "#f43f5e"],
};

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${+a.toFixed(3)})`;
};
const withAlpha = (hex, alpha) => (alpha == null ? hex : rgba(hex, alpha));

// The dark value for one utility (without variant), or null to leave it alone.
function darkValue(kind, color, shade, alpha) {
  if (color === "slate" || color === "gray" || color === "white") {
    const key = color === "white" ? "white" : shade;
    if (kind === "bg") {
      // Translucent white on light pages is a frosted card; below 50% it's a
      // highlight on a dark section, which already looks right.
      if (color === "white" && alpha != null && alpha < 0.5) return null;
      return NEUTRAL.bg[key] ? withAlpha(NEUTRAL.bg[key], alpha) : null;
    }
    if (kind === "text") return color === "white" ? null : NEUTRAL.text[key] ?? null;
    if (color === "white" && alpha != null) return null;
    return NEUTRAL.line[key] ? withAlpha(NEUTRAL.line[key], alpha) : null;
  }
  const c = COLORS[color];
  if (!c) return null;
  const [c300, c400, c500] = c;
  const a = alpha ?? 1;
  if (kind === "bg") return { 50: rgba(c500, 0.1 * a), 100: rgba(c500, 0.16 * a), 200: rgba(c500, 0.24 * a) }[shade] ?? null;
  if (kind === "text") return { 600: c400, 700: c300, 800: c300, 900: c300, 950: c300 }[shade] ?? null;
  return { 50: rgba(c500, 0.2), 100: rgba(c500, 0.25), 200: rgba(c500, 0.3), 300: rgba(c500, 0.4) }[shade] ?? null;
}

// --- Finding the classes -------------------------------------------------------

const VARIANTS = {
  "": s => s,
  "hover:": s => `${s}:hover`,
  "focus:": s => `${s}:focus`,
  "focus-within:": s => `${s}:focus-within`,
  "active:": s => `${s}:active`,
  "disabled:": s => `${s}:disabled`,
  "group-hover:": s => `.group:hover ${s}`,
};
const UTILITY = /^(hover:|focus:|focus-within:|active:|disabled:|group-hover:)?(bg|text|border(?:-[xytblr])?|ring|divide)-(white|slate|gray|[a-z]+)(?:-(\d{2,3}))?(?:\/(\d{1,3}))?$/;

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(tsx?|jsx?)$/.test(name)) yield path;
  }
}

const tokens = new Set();
for (const dir of ["app", "utils"]) {
  for (const file of sourceFiles(join(root, dir))) {
    for (const t of readFileSync(file, "utf8").match(/[a-z0-9:\-/]+/g) ?? []) tokens.add(t);
  }
}

const escape = cls => cls.replace(/[:/.]/g, m => `\\${m}`);
const SIDE = { x: ["left", "right"], y: ["top", "bottom"], t: ["top"], b: ["bottom"], l: ["left"], r: ["right"] };

const rules = [];
for (const cls of [...tokens].sort()) {
  const m = UTILITY.exec(cls);
  if (!m) continue;
  const [, variant = "", util, color, shade, pct] = m;
  if (color !== "white" && !shade) continue;
  const kind = util === "bg" ? "bg" : util === "text" ? "text" : "line";
  const value = darkValue(kind, color, shade ? Number(shade) : undefined, pct ? Number(pct) / 100 : undefined);
  if (!value) continue;

  let selector = VARIANTS[variant](`.${escape(cls)}`);
  let decl;
  if (util === "bg") decl = `background-color: ${value}`;
  else if (util === "text") decl = `color: ${value}`;
  else if (util === "ring") decl = `--tw-ring-color: ${value}`;
  else if (util === "divide") { selector += " > :not(:last-child)"; decl = `border-color: ${value}`; }
  else if (util === "border") decl = `border-color: ${value}`;
  else decl = SIDE[util.slice(-1)].map(s => `border-${s}-color: ${value}`).join("; ");
  rules.push(`.dark ${selector} { ${decl}; }`);
}

const header = `/* Generated by scripts/build-dark-theme.mjs (npm run theme:css) — do not edit by hand.
   Dark-mode values for the light colour classes used in app/ and utils/. */\n`;
writeFileSync(join(root, "app", "dark-theme.css"), header + rules.join("\n") + "\n");
console.log(`dark-theme.css: ${rules.length} rules`);
