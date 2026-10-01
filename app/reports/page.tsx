"use client";

import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";
import { useAuth } from "../context/AuthContext";
import { downloadFile, errText, fmtDay, isoDate } from "../billing/_components/billing";

interface ReportInfo {
  key: string;
  title: string;
  description: string;
  period: "RANGE" | "TODAY";
}

const firstOfMonth = (monthsBack = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - monthsBack, 1);
};
const lastOfMonth = (monthsBack: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - monthsBack + 1, 0);
};

const PRESETS: { label: string; range: () => [Date, Date] }[] = [
  { label: "Today", range: () => [new Date(), new Date()] },
  { label: "This month", range: () => [firstOfMonth(), new Date()] },
  { label: "Last month", range: () => [firstOfMonth(1), lastOfMonth(1)] },
  { label: "This year", range: () => [new Date(new Date().getFullYear(), 0, 1), new Date()] },
];

// Finance reports as a themed PDF or an Excel workbook. Both formats are built
// from the same figures on the server.
export default function ReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ReportInfo[]>([]);
  const [from, setFrom] = useState(() => isoDate(firstOfMonth()));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    api.get<ReportInfo[]>("/finance/reports").then(res => setReports(res.data))
      .catch(err => setNotice({ type: "error", text: errText(err, "Couldn't load the report list.") }));
  }, [user]);

  const download = async (report: ReportInfo, format: "pdf" | "xlsx") => {
    setBusy(`${report.key}-${format}`);
    setNotice(null);
    try {
      const stamp = report.period === "TODAY" ? isoDate(new Date()) : `${from}_to_${to}`;
      await downloadFile(`/finance/reports/${report.key}`, `${report.title.replace(/\s+/g, "-")}_${stamp}.${format}`, { from, to, format });
      setNotice({ type: "ok", text: `${report.title} downloaded as ${format === "pdf" ? "PDF" : "Excel"}.` });
    } catch (err) {
      setNotice({ type: "error", text: errText(err, `Couldn't generate the ${report.title} report.`) });
    } finally {
      setBusy(null);
    }
  };

  const rangeInvalid = !from || !to || from > to;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Reports</h1>
          <p className="text-slate-500 font-medium mt-1">Download finance reports as a branded PDF or as an Excel workbook you can sort and total.</p>
        </div>

        {notice && (
          <div role="status" className={`px-4 py-3 rounded-xl text-sm font-bold border ${notice.type === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>{notice.text}</div>
        )}

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="rp-from" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">From</label>
            <input id="rp-from" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label htmlFor="rp-to" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">To</label>
            <input id="rp-to" type="date" value={to} min={from} max={isoDate(new Date())} onChange={e => setTo(e.target.value)} className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500" />
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.label} type="button" onClick={() => { const [a, b] = p.range(); setFrom(isoDate(a)); setTo(isoDate(b)); }}
                className="px-3 py-2 rounded-lg text-xs font-bold text-slate-700 border border-slate-200 hover:border-slate-400 hover:bg-slate-50">
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-500 ml-auto">{rangeInvalid ? <span className="font-bold text-red-600">Choose a valid period.</span> : <>Period: <span className="font-bold text-slate-900">{fmtDay(from)} – {fmtDay(to)}</span></>}</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {reports.map(r => (
            <article key={r.key} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col">
              <span className={`self-start px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${r.period === "RANGE" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                {r.period === "RANGE" ? "For the period" : "As of today"}
              </span>
              <h2 className="mt-3 text-xl font-black text-slate-900">{r.title}</h2>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed flex-1">{r.description}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button onClick={() => download(r, "pdf")} disabled={busy !== null || (r.period === "RANGE" && rangeInvalid)}
                  className="py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
                  {busy === `${r.key}-pdf` ? "Preparing..." : "PDF"}
                </button>
                <button onClick={() => download(r, "xlsx")} disabled={busy !== null || (r.period === "RANGE" && rangeInvalid)}
                  className="py-2.5 rounded-xl text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50">
                  {busy === `${r.key}-xlsx` ? "Preparing..." : "Excel"}
                </button>
              </div>
            </article>
          ))}
          {reports.length === 0 && <p className="text-sm text-slate-500">No reports available.</p>}
        </div>
      </div>
    </div>
  );
}
