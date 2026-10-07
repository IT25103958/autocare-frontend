"use client";

import { useState } from "react";
import api from "../../../utils/axiosInstance";
import SlotPicker from "./SlotPicker";
import { Booking, BookingEvent, BookingStatusBadge, EVENT_LABEL, Notice, errorText, fmtWhen, jobRef } from "./booking";

// The customer's upcoming appointments with reschedule / cancel (up to the
// cut-off before the appointment) and a progress timeline.
export default function CustomerUpcoming({ bookings, cutoffHours, onChanged }: {
  bookings: Booking[];
  cutoffHours: number;
  onChanged: () => void;
}) {
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [rescheduling, setRescheduling] = useState<Booking | null>(null);
  const [newSlot, setNewSlot] = useState("");
  const [saving, setSaving] = useState(false);
  const [openTimeline, setOpenTimeline] = useState<number | null>(null);
  const [events, setEvents] = useState<BookingEvent[]>([]);

  // "Now" as of opening the page (reading the clock during render isn't allowed).
  const [now] = useState(() => Date.now());
  const canChange = (b: Booking) =>
    ["PENDING", "CONFIRMED"].includes(b.status) && new Date(b.preferredDate).getTime() - now > cutoffHours * 3_600_000;

  const cancel = async (b: Booking) => {
    const reason = prompt(`Cancel your ${b.servicePackage} on ${fmtWhen(b.preferredDate)}? You can tell us why (optional):`);
    if (reason === null) return;
    try {
      await api.put(`/bookings/${b.bookingID}/cancel`, { reason });
      setNotice({ type: "ok", text: "Your booking has been cancelled." });
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't cancel the booking.") });
    }
  };

  const reschedule = async () => {
    if (!rescheduling || !newSlot) return;
    setSaving(true);
    try {
      await api.put(`/bookings/${rescheduling.bookingID}/reschedule`, { preferredDate: newSlot });
      setNotice({ type: "ok", text: `Moved to ${fmtWhen(newSlot)}. The workshop will re-confirm your technician.` });
      setRescheduling(null);
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, "Couldn't reschedule.") });
    } finally {
      setSaving(false);
    }
  };

  const toggleTimeline = async (id: number) => {
    if (openTimeline === id) { setOpenTimeline(null); return; }
    setOpenTimeline(id);
    setEvents([]);
    try {
      const res = await api.get<BookingEvent[]>(`/bookings/${id}/events`);
      setEvents(res.data);
    } catch {
      setEvents([]);
    }
  };

  if (bookings.length === 0) return null;

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-4">Upcoming Appointments</h2>
      <Notice notice={notice} />
      <ul className="space-y-3 mt-3">
        {bookings.map(b => (
          <li key={b.bookingID} className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-500">{jobRef(b.bookingID)}</span>
                  <BookingStatusBadge status={b.status} />
                </div>
                <p className="font-bold text-slate-900 mt-1">{b.servicePackage}</p>
                <p className="text-sm text-slate-600">{fmtWhen(b.preferredDate)} · <span className="font-mono">{b.vehicleRegNo}</span></p>
                {b.status === "CONFIRMED" && b.assignedServiceBay && (
                  <p className="text-xs text-slate-500 mt-1">{b.assignedServiceBay}{b.technicianName ? ` · Technician: ${b.technicianName}` : ""}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleTimeline(b.bookingID)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100" aria-expanded={openTimeline === b.bookingID}>
                  Progress
                </button>
                {canChange(b) ? (
                  <>
                    <button onClick={() => { setRescheduling(b); setNewSlot(""); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-50">Reschedule</button>
                    <button onClick={() => cancel(b)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 hover:bg-red-50">Cancel</button>
                  </>
                ) : ["PENDING", "CONFIRMED"].includes(b.status) && (
                  <span className="text-[11px] text-slate-500">Changes close {cutoffHours}h before — call us</span>
                )}
              </div>
            </div>
            {openTimeline === b.bookingID && (
              <ol className="relative border-l-2 border-slate-200 ml-6 my-3 space-y-3 pr-4">
                {events.map(e => (
                  <li key={e.eventId} className="ml-4">
                    <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white" aria-hidden="true"></span>
                    <p className="text-sm font-bold text-slate-900">{EVENT_LABEL[e.action] || e.action}</p>
                    <p className="text-xs text-slate-500">{fmtWhen(e.createdAt)}</p>
                    {e.note && e.action !== "BOOKED" && <p className="text-xs text-slate-600">{e.note}</p>}
                  </li>
                ))}
                {events.length === 0 && <li className="ml-4 text-xs text-slate-500">Loading...</li>}
              </ol>
            )}
          </li>
        ))}
      </ul>

      {rescheduling && (
        <div className="fixed inset-0 z-50 flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="resched-title">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-lg w-full border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 id="resched-title" className="text-xl font-black text-slate-900">Reschedule {jobRef(rescheduling.bookingID)}</h3>
              <p className="text-sm text-slate-500 mt-1">{rescheduling.servicePackage} · currently {fmtWhen(rescheduling.preferredDate)}</p>
            </div>
            <SlotPicker packageId={rescheduling.packageId} value={newSlot} onChange={setNewSlot} />
            {!rescheduling.packageId && <p className="text-xs text-slate-500">This older booking has no package on file — please call the workshop to move it.</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setRescheduling(null)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Keep current time</button>
              <button onClick={reschedule} disabled={!newSlot || saving} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving..." : "Move Appointment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
