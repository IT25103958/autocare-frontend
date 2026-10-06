"use client";

import { PriorityBadge, Ticket } from "../../_components/crm";

// The local AI model's reading of a ticket (ComplaintTriageService). Staff only.
export interface Suggestion {
  ticketId: number;
  status: "PENDING" | "READY" | "UNAVAILABLE";
  category: string | null;
  desk: string | null;
  priority: Ticket["priority"] | null;
  summary: string | null;
  nextStep: string | null;
  model: string | null;
  millis: number | null;
}

// True when the AI thinks the ticket is urgent but it isn't marked so yet.
export const aiFlagsUrgent = (t: Ticket, s?: Suggestion) =>
  t.status !== "RESOLVED" && s?.status === "READY" && s.priority === "URGENT" && t.priority !== "URGENT";

// One line under a ticket in the queue: only shown while the AI is working, or
// when its suggestion differs from how the ticket is currently set.
export function AiChip({ ticket, suggestion }: { ticket: Ticket; suggestion?: Suggestion }) {
  if (!suggestion || ticket.status === "RESOLVED") return null;
  if (suggestion.status === "PENDING") {
    return <p className="text-[11px] font-bold text-slate-400 mt-1.5 animate-pulse">AI is reading this ticket…</p>;
  }
  if (suggestion.status !== "READY") return null;
  const deskDiffers = suggestion.desk && suggestion.desk !== ticket.assignedStaff;
  const priorityDiffers = suggestion.priority && suggestion.priority !== ticket.priority;
  if (!deskDiffers && !priorityDiffers) return null;
  return (
    <p className={`text-[11px] font-bold mt-1.5 ${aiFlagsUrgent(ticket, suggestion) ? "text-red-700" : "text-violet-700"}`}>
      <span aria-hidden="true">✦ </span>AI suggests: {[deskDiffers && suggestion.desk, priorityDiffers && suggestion.priority].filter(Boolean).join(" · ")}
    </p>
  );
}

// The suggestion in the ticket drawer, with buttons that use the normal
// assign / priority actions. Nothing changes until staff press one.
export function AiSuggestionPanel({ ticket, suggestion, canAssign, canAct, onUseDesk, onUsePriority, onAskAgain }: {
  ticket: Ticket;
  suggestion?: Suggestion;
  canAssign: boolean;
  canAct: boolean;
  onUseDesk: (desk: string) => void;
  onUsePriority: (priority: string) => void;
  onAskAgain: () => void;
}) {
  const resolved = ticket.status === "RESOLVED";
  const box = "rounded-2xl border border-violet-200 bg-violet-50/50 p-4";
  const heading = <p className="text-xs font-black uppercase tracking-widest text-violet-800 mb-2"><span aria-hidden="true">✦ </span>AI suggestion</p>;

  if (!suggestion || suggestion.status === "UNAVAILABLE") {
    if (resolved) return null;
    return (
      <div className={box}>
        {heading}
        <p className="text-sm text-slate-600">{suggestion ? "The AI couldn't read this ticket (it may be switched off or busy)." : "No AI suggestion for this ticket yet."}</p>
        {canAct && <button onClick={onAskAgain} className="mt-2 text-xs font-black text-violet-800 hover:underline">Ask AI</button>}
      </div>
    );
  }
  if (suggestion.status === "PENDING") {
    return <div className={box}>{heading}<p className="text-sm text-slate-500 animate-pulse">Reading the ticket… usually a few seconds.</p></div>;
  }

  const deskDiffers = suggestion.desk && suggestion.desk !== ticket.assignedStaff;
  const priorityDiffers = suggestion.priority && suggestion.priority !== ticket.priority;
  return (
    <div className={box}>
      {heading}
      {suggestion.summary && <p className="text-sm font-bold text-slate-900">{suggestion.summary}</p>}
      <dl className="grid grid-cols-2 gap-3 text-sm mt-3">
        <div>
          <dt className="text-xs font-bold text-slate-500">Department</dt>
          <dd className="text-slate-900">{suggestion.desk}</dd>
          {deskDiffers && canAssign && !resolved && suggestion.desk && (
            <button onClick={() => onUseDesk(suggestion.desk!)} className="mt-1 text-xs font-black text-violet-800 hover:underline">Route there</button>
          )}
        </div>
        <div>
          <dt className="text-xs font-bold text-slate-500">Priority</dt>
          <dd>{suggestion.priority && <PriorityBadge priority={suggestion.priority} />}</dd>
          {priorityDiffers && canAct && !resolved && suggestion.priority && (
            <button onClick={() => onUsePriority(suggestion.priority!)} className="mt-1 text-xs font-black text-violet-800 hover:underline">Use this priority</button>
          )}
        </div>
      </dl>
      {suggestion.nextStep && (
        <p className="text-sm text-slate-700 mt-3"><span className="font-bold">First step: </span>{suggestion.nextStep}</p>
      )}
      <p className="text-[10px] text-slate-500 mt-3">
        Suggested by a local AI model ({suggestion.model}{suggestion.millis ? `, ${(suggestion.millis / 1000).toFixed(1)} s` : ""}). Check it before acting.
      </p>
    </div>
  );
}
