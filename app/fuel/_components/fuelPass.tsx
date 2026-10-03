"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Shared by the pump screen, the fuel pass register and the customer portal.

export interface FuelPass {
  passId: number;
  code: string;
  qrText: string;
  vehicleRegNo: string;
  vehicleCategory: string;
  ownerName: string | null;
  customerUsername: string | null;
  status: "ACTIVE" | "SUSPENDED";
  weeklyQuota: number;
  usedThisWeek: number;
  remaining: number;
  resetsAt: string;
  issuedAt: string | null;
}

export interface FuelPassSettings {
  required: boolean;
  // Which quota authority clears a pump sale: our own pass, the National Fuel Pass, or either.
  mode: "LOCAL" | "NATIONAL" | "BOTH";
  localEnabled: boolean;
  nationalEnabled: boolean;
  // The official station app / portal the pump screen links to.
  nationalStationUrl: string;
  qrPrefix: string;
  weeklyQuota: Record<string, number>;
  weekStart: string;
  resetsAt: string;
}

export const CATEGORY_LABEL: Record<string, string> = {
  MOTORCYCLE: "Motorcycle",
  THREE_WHEELER: "Three-wheeler",
  QUADRICYCLE: "Quadricycle",
  CAR: "Car",
  VAN: "Van",
  BUS: "Bus",
  LORRY: "Lorry",
  LAND_VEHICLE: "Land vehicle",
  SPECIAL_PURPOSE: "Special purpose vehicle",
};

export const categoryName = (c: string) => CATEGORY_LABEL[c] ?? c;

export const litres = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} L`;

export const resetText = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });

// Draws the pass's QR code. Quiet zone and high contrast are kept so it scans
// from a phone screen as well as from paper.
export function QrImage({ text, size = 220, className = "" }: { text: string; size?: number; className?: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 2, width: size * 2, color: { dark: "#0f172a", light: "#ffffff" } })
      .then(url => { if (live) setSrc(url); })
      .catch(() => { if (live) setSrc(""); });
    return () => { live = false; };
  }, [text, size]);

  return src
    // eslint-disable-next-line @next/next/no-img-element -- generated data URL, nothing for next/image to optimise
    ? <img src={src} width={size} height={size} alt="Fuel pass QR code" className={`rounded-xl bg-white ${className}`} />
    : <div style={{ width: size, height: size }} className={`rounded-xl bg-slate-100 animate-pulse ${className}`} />;
}

// How much of the week's quota is used, with the litres left spelled out.
export function QuotaBar({ pass, dark = false }: { pass: FuelPass; dark?: boolean }) {
  const pct = pass.weeklyQuota > 0 ? Math.min(100, (pass.usedThisWeek / pass.weeklyQuota) * 100) : 100;
  const empty = pass.remaining <= 0;
  return (
    <div>
      <div className={`h-2.5 rounded-full overflow-hidden ${dark ? "bg-white/15" : "bg-slate-200"}`}>
        <div className={`h-full rounded-full transition-all duration-500 ${empty ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }} />
      </div>
      <div className={`mt-1.5 flex justify-between text-xs font-bold ${dark ? "text-slate-300" : "text-slate-500"}`}>
        <span>{litres(pass.usedThisWeek)} used of {litres(pass.weeklyQuota)}</span>
        <span>Resets {resetText(pass.resetsAt)}</span>
      </div>
    </div>
  );
}

// Opens a print-ready page with just the pass, for the driver to keep in the vehicle.
export async function printPass(pass: FuelPass) {
  const qr = await QRCode.toDataURL(pass.qrText, { errorCorrectionLevel: "M", margin: 2, width: 600 });
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  const w = window.open("", "_blank", "width=480,height=720");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Fuel pass ${esc(pass.vehicleRegNo)}</title>
<style>
  body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:32px;color:#0f172a;display:flex;justify-content:center}
  .card{width:340px;border:2px solid #0f172a;border-radius:20px;overflow:hidden;text-align:center}
  .head{background:#0f172a;color:#fff;padding:16px}
  .head b{display:block;font-size:18px;letter-spacing:.02em}
  .head span{font-size:11px;letter-spacing:.2em;text-transform:uppercase;opacity:.75}
  img{width:260px;height:260px;margin:20px auto 8px;display:block}
  .reg{font-size:30px;font-weight:900;letter-spacing:.06em}
  .meta{font-size:13px;color:#475569;margin:6px 0 4px}
  .code{font-family:ui-monospace,Consolas,monospace;font-size:13px;letter-spacing:.14em;color:#334155;margin-bottom:18px}
  .foot{border-top:1px dashed #94a3b8;padding:12px 16px;font-size:11px;color:#64748b}
  @media print{body{padding:0}}
</style></head><body><div class="card">
  <div class="head"><b>Lanka Auto Care</b><span>Fuel Pass</span></div>
  <img src="${qr}" alt="QR code">
  <div class="reg">${esc(pass.vehicleRegNo)}</div>
  <div class="meta">${esc(categoryName(pass.vehicleCategory))} &middot; ${pass.weeklyQuota} L per week${pass.ownerName ? " &middot; " + esc(pass.ownerName) : ""}</div>
  <div class="code">${esc(pass.code)}</div>
  <div class="foot">Show this code at the pump. Valid at Lanka Auto Care, Malabe only.</div>
</div><script>onload=()=>{setTimeout(()=>print(),150)}</script></body></html>`);
  w.document.close();
  return true;
}
