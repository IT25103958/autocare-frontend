"use client";

import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { Booking, BookingEvent, BookingStatusBadge, EVENT_LABEL, fmtWhen, jobRef, rupees } from "./booking";

// Full job view: details, final report / bill, and the status timeline.
export default function JobDetailDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const [events, setEvents] = useState<BookingEvent[]>([]);

  useEffect(() => {
    api.get<BookingEvent[]>(`/bookings/${booking.bookingID}/events`).then(res => setEvents(res.data)).catch(() => setEvents([]));
  }, [booking.bookingID]);

  const billed = booking.status === "COMPLETED" || booking.status === "PAID";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="job-title" className="w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <h2 id="job-title" className="text-lg font-black text-slate-900">{jobRef(booking.bookingID)}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusBadge status={booking.status} />
            <span className="font-mono font-bold text-slate-900">{booking.vehicleRegNo}</span>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs font-bold text-slate-500">Service</dt><dd className="font-bold text-slate-900">{booking.servicePackage}</dd></div>
            <div><dt className="text-xs font-bold text-slate-500">Appointment</dt><dd className="text-slate-900">{fmtWhen(booking.preferredDate)}</dd></div>
            <div><dt className="text-xs font-bold text-slate-500">Technician</dt><dd className="text-slate-900">{booking.technicianName || "Not assigned"}</dd></div>
            <div><dt className="text-xs font-bold text-slate-500">Bay</dt><dd className="text-slate-900">{booking.assignedServiceBay || "—"}</dd></div>
            <div><dt className="text-xs font-bold text-slate-500">Customer account</dt><dd className="text-slate-900">{booking.customerUsername || "Walk-in"}</dd></div>
            <div><dt className="text-xs font-bold text-slate-500">Quoted</dt><dd className="text-slate-900 tabular-nums">{booking.quotedPrice != null ? rupees(booking.quotedPrice) : "—"}</dd></div>
          </dl>

          {booking.customerNotes && <p className="text-sm p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900"><span className="font-bold">Customer: </span>{booking.customerNotes}</p>}
          {booking.managerNotes && <p className="text-sm p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900"><span className="font-bold">Manager: </span>{booking.managerNotes}</p>}
          {booking.status === "DELAYED" && booking.delayReason && <p className="text-sm p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-900"><span className="font-bold">Delayed: </span>{booking.delayReason}</p>}
          {booking.status === "CANCELLED" && <p className="text-sm p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700"><span className="font-bold">Cancelled by {booking.cancelledBy || "—"}{booking.cancelReason ? ": " : ""}</span>{booking.cancelReason}</p>}

          {billed && (
            <section className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Final report</h3>
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-900 whitespace-pre-wrap">{booking.technicianNotes || "No diagnostic notes recorded."}</div>
              <div className="p-4 border border-slate-200 rounded-xl">
                <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap">{booking.partsUsedSummary}</pre>
                <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900">Net total</span>
                  <span className="text-xl font-black text-emerald-700 tabular-nums">{rupees(booking.netTotal)}</span>
                </div>
              </div>
            </section>
          )}

          <section>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Timeline</h3>
            <ol className="relative border-l-2 border-slate-200 ml-2 space-y-4">
              {events.map(e => (
                <li key={e.eventId} className="ml-4">
                  <span className={`absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full border-2 border-white ${e.action === "CANCELLED" ? "bg-slate-400" : e.action === "DELAYED" ? "bg-orange-500" : e.action === "COMPLETED" || e.action === "PAID" ? "bg-emerald-600" : "bg-blue-600"}`} aria-hidden="true"></span>
                  <p className="text-sm font-bold text-slate-900">{EVENT_LABEL[e.action] || e.action}</p>
                  <p className="text-xs text-slate-500">{fmtWhen(e.createdAt)} · {e.performedBy}</p>
                  {e.note && <p className="text-xs text-slate-600 mt-1">{e.note}</p>}
                </li>
              ))}
              {events.length === 0 && <li className="ml-4 text-xs text-slate-500">No timeline recorded (older booking).</li>}
            </ol>
          </section>
        </div>
      </aside>
    </div>
  );
}
