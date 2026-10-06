"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";

interface Fact {
  severity: "HIGH" | "MEDIUM" | "INFO";
  sentence: string;
  figures: string[];
}

interface Brief {
  date: string;
  text: string;
  source: "AI" | "PLAIN" | "PENDING";
  note: string | null;
  facts: Fact[];
}

const DOT: Record<Fact["severity"], string> = { HIGH: "bg-red-600", MEDIUM: "bg-amber-500", INFO: "bg-slate-300" };

function isoDay(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The day in plain words (DailyBriefService). The figures come from the books;
// the local AI only words them, and its version is shown only if every figure
// survived unchanged. While it writes, the plain version is shown.
export default function DailyBrief() {
  const [day, setDay] = useState<"yesterday" | "today">("yesterday");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [failed, setFailed] = useState(false);
  const [showFacts, setShowFacts] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    const load = () => {
      api.get<Brief>("/insights/daily-brief", { params: { date: isoDay(day === "today" ? 0 : -1) } })
        .then(res => {
          if (cancelled) return;
          setBrief(res.data);
          setFailed(false);
          // Check back while the AI is still writing (about a minute at most).
          if (res.data.source === "PENDING" && polls++ < 15) timer = setTimeout(load, 4000);
        })
        .catch(() => { if (!cancelled) setFailed(true); });
    };
    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [day]);

  if (failed) return null; // a helper: the dashboard works without it

  return (
    <section aria-labelledby="daily-brief-title" className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 id="daily-brief-title" className="text-lg font-black text-slate-900">Daily Brief</h3>
          <p className="text-xs font-semibold text-slate-500 mt-1">The day in plain words. Every figure comes from the books.</p>
        </div>
        <div className="flex rounded-xl border border-slate-200 p-0.5 text-xs font-bold" role="group" aria-label="Which day">
          {(["yesterday", "today"] as const).map(d => (
            <button key={d} onClick={() => { setDay(d); setBrief(null); }} aria-pressed={day === d}
              className={`px-3 py-1.5 rounded-lg ${day === d ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {d === "yesterday" ? "Yesterday" : "Today so far"}
            </button>
          ))}
        </div>
      </div>

      {!brief && <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />}
      {brief && (
        <>
          <p className="text-[15px] leading-relaxed text-slate-800">{brief.text}</p>
          <p className="mt-3 text-[11px] font-bold flex items-center gap-1.5">
            {brief.source === "AI" && <span className="text-violet-700"><span aria-hidden="true">✦ </span>{brief.note}</span>}
            {brief.source === "PENDING" && <span className="text-slate-400 animate-pulse">The AI is writing a friendlier version…</span>}
            {brief.source === "PLAIN" && <span className="text-slate-500">Plain summary{brief.note ? ` — ${brief.note}` : "."}</span>}
          </p>

          {brief.facts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <button onClick={() => setShowFacts(v => !v)} aria-expanded={showFacts} className="text-xs font-bold text-blue-700 hover:underline">
                {showFacts ? "Hide the facts" : `The ${brief.facts.length} facts behind it`}
              </button>
              {showFacts && (
                <ul className="mt-3 space-y-2">
                  {brief.facts.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[f.severity]}`} aria-hidden="true" />
                      <span><span className="sr-only">{f.severity === "INFO" ? "For the record: " : f.severity === "HIGH" ? "Act today: " : "Look at: "}</span>{f.sentence}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
