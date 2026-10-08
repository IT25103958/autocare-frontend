"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Shared by the pump screen, the rewards card register and the customer portal.
// The card earns loyalty points on fuel; it carries no quota (that is the
// government's National Fuel Pass, deducted in the official app).

export interface FuelPass {
  passId: number;
  code: string;
  qrText: string;
  vehicleRegNo: string;
  ownerName: string | null;
  customerUsername: string | null;
  status: "ACTIVE" | "SUSPENDED";
  // Points go to a customer account; a card without one still records the vehicle.
  earnsPoints: boolean;
  customerName: string | null;
  membershipTier: string | null;
  issuedAt: string | null;
}

export interface FuelPassSettings {
  // Whether every sale needs the National Fuel Pass deduction confirmed.
  required: boolean;
  // The official station app / portal the pump screen links to.
  nationalStationUrl: string;
  qrPrefix: string;
  pointsPerLitre: number;
}

export const litres = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} L`;

export const pointsRule = (perLitre: number) => perLitre > 0
  ? `${perLitre} point${perLitre === 1 ? "" : "s"} per litre`
  : "Fuel points are paused";

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
    ? <img src={src} width={size} height={size} alt="Fuel rewards card QR code" className={`rounded-xl bg-white ${className}`} />
    : <div style={{ width: size, height: size }} className={`rounded-xl bg-slate-100 animate-pulse ${className}`} />;
}

// Opens a print-ready page with just the pass, for the driver to keep in the vehicle.
export async function printPass(pass: FuelPass, pointsPerLitre?: number) {
  const qr = await QRCode.toDataURL(pass.qrText, { errorCorrectionLevel: "M", margin: 2, width: 600 });
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  const w = window.open("", "_blank", "width=480,height=720");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Fuel rewards card ${esc(pass.vehicleRegNo)}</title>
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
  <div class="head"><b>Lanka Auto Care</b><span>Fuel Rewards</span></div>
  <img src="${qr}" alt="QR code">
  <div class="reg">${esc(pass.vehicleRegNo)}</div>
  <div class="meta">${pointsPerLitre !== undefined ? esc(pointsRule(pointsPerLitre)) : "Earns loyalty points"}${pass.ownerName ? " &middot; " + esc(pass.ownerName) : ""}</div>
  <div class="code">${esc(pass.code)}</div>
  <div class="foot">Show this card at the pump to earn points. Spend them on service bills at Lanka Auto Care, Malabe.</div>
</div><script>onload=()=>{setTimeout(()=>print(),150)}</script></body></html>`);
  w.document.close();
  return true;
}
