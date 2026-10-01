"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { downloadFile, errText, fmtWhen, lkr } from "./billing";

interface FuelPurchase {
  saleId: number;
  fuelType: string;
  pumpNumber: number;
  litersPumped: number;
  totalCost: number;
  saleDate: string | null;
  paymentMethod: string | null;
  status: string | null;
}

const SHOWN = 5;

// Customer portal: fuel bought for the customer's registered vehicle, with a
// PDF receipt for each purchase. Hidden until there is at least one.
export default function CustomerFuelPurchases() {
  const [sales, setSales] = useState<FuelPurchase[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<FuelPurchase[]>("/fuel/my").then(res => setSales(res.data.filter(s => s.status !== "VOIDED"))).catch(() => setSales([]));
  }, []);

  if (sales.length === 0) return null;

  const receipt = async (s: FuelPurchase) => {
    setError("");
    try {
      await downloadFile(`/fuel/${s.saleId}/receipt`, `fuel-receipt-${s.saleId}.pdf`);
    } catch (err) {
      setError(errText(err, "Couldn't download the receipt."));
    }
  };

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Fuel Purchases</h2>
        {sales.length > SHOWN && (
          <button onClick={() => setShowAll(v => !v)} className="text-xs font-bold text-blue-700 hover:underline">{showAll ? "Show fewer" : `Show all (${sales.length})`}</button>
        )}
      </div>
      {error && <p role="alert" className="mb-3 text-sm font-bold text-red-600">{error}</p>}
      <ul className="divide-y divide-slate-100">
        {(showAll ? sales : sales.slice(0, SHOWN)).map(s => (
          <li key={s.saleId} className="py-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-slate-900">{s.litersPumped.toFixed(2)} L · {s.fuelType}</p>
              <p className="text-xs text-slate-500">{fmtWhen(s.saleDate)} · Pump {s.pumpNumber}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-black tabular-nums text-slate-900">{lkr(s.totalCost)}</span>
              <button onClick={() => receipt(s)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-50">Receipt PDF</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
