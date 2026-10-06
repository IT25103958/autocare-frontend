"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "jsqr";

type CameraState = "starting" | "scanning" | "blocked" | "unavailable";

// Reads a fuel pass QR with the device camera. Works on the forecourt tablet or
// phone (rear camera) and on a desk webcam. When no camera can be used, the pass
// can be read from a photo of the QR or looked up by typing its code or the
// vehicle number.
export default function FuelPassScanner({ onDetected, onClose, busy = false, error = "" }: {
  onDetected: (text: string) => void;
  onClose: () => void;
  // The parent is checking the scanned code with the server.
  busy?: boolean;
  // Why the last scanned code was refused.
  error?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef(0);
  // The last code handed to the parent, so the same QR held in view isn't sent again and again.
  const lastRef = useRef({ text: "", at: 0 });
  const busyRef = useRef(busy);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [cameraKey, setCameraKey] = useState(0);
  const [manual, setManual] = useState("");
  const [photoError, setPhotoError] = useState("");

  useEffect(() => { busyRef.current = busy; }, [busy]);

  const report = useCallback((text: string) => {
    const now = Date.now();
    if (busyRef.current) return;
    if (text === lastRef.current.text && now - lastRef.current.at < 3000) return;
    lastRef.current = { text, at: now };
    if (navigator.vibrate) navigator.vibrate(60);
    onDetected(text);
  }, [onDetected]);

  const decode = useCallback((source: CanvasImageSource, width: number, height: number) => {
    // Small frames decode faster and are plenty for a QR held up to the camera.
    const scale = Math.min(1, 720 / Math.max(width, height));
    const w = Math.round(width * scale), h = Math.round(height * scale);
    const canvas = canvasRef.current ?? (canvasRef.current = document.createElement("canvas"));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    return jsQR(image.data, w, h, { inversionAttempts: "attemptBoth" })?.data ?? null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };

    const tick = () => {
      const video = videoRef.current;
      if (cancelled || !video) return;
      if (video.readyState >= 2 && video.videoWidth > 0 && !busyRef.current) {
        const text = decode(video, video.videoWidth, video.videoHeight);
        if (text) report(text);
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    (async () => {
      // Cameras are only offered to pages on https or localhost.
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera("unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setCamera("scanning");
        frameRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        setCamera(name === "NotAllowedError" || name === "SecurityError" ? "blocked" : "unavailable");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [cameraKey, decode, report]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const readPhoto = async (file: File | undefined) => {
    setPhotoError("");
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const text = decode(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      if (text) {
        lastRef.current = { text: "", at: 0 };
        report(text);
      } else {
        setPhotoError("No QR code found in that picture. Try a sharper, closer photo.");
      }
    } catch {
      setPhotoError("That file couldn't be read as a picture.");
    }
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const text = manual.trim();
    if (!text || busy) return;
    lastRef.current = { text: "", at: 0 };
    report(text);
  };

  // Rendered into <body>: the page animates in with a transform, which would
  // otherwise anchor this overlay to the page instead of the window.
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center-safe justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label="Scan fuel pass">
      <div className="w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div>
            <h3 className="text-lg font-black text-slate-900">Scan fuel pass</h3>
            <p className="text-xs font-medium text-slate-500">Hold the driver&apos;s QR code inside the frame.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close scanner"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black flex items-center justify-center">✕</button>
        </div>

        <div className="mx-6 relative aspect-square rounded-2xl overflow-hidden bg-slate-900">
          <video ref={videoRef} playsInline muted className={`w-full h-full object-cover ${camera === "scanning" ? "" : "invisible"}`} />

          {camera === "scanning" && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-[14%] rounded-2xl shadow-[0_0_0_999px_rgba(2,6,23,0.55)]">
                {["top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl", "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
                  "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"].map(c => (
                  <span key={c} className={`absolute w-9 h-9 border-emerald-400 ${c}`} />
                ))}
                {!busy && <span className="qr-scan-line absolute left-2 right-2 h-0.5 bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.8)]" />}
              </div>
              {busy && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60">
                  <span className="px-4 py-2 rounded-full bg-white text-sm font-black text-slate-900">Checking pass…</span>
                </div>
              )}
            </div>
          )}

          {camera !== "scanning" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-slate-200">
              {camera === "starting" && <p className="text-sm font-bold">Starting camera…</p>}
              {camera === "blocked" && (
                <>
                  <p className="text-sm font-black text-white">Camera access is blocked</p>
                  <p className="mt-1 text-xs text-slate-300">Allow the camera for this site in the browser&apos;s address bar, then try again.</p>
                </>
              )}
              {camera === "unavailable" && (
                <>
                  <p className="text-sm font-black text-white">No camera available</p>
                  <p className="mt-1 text-xs text-slate-300">Use a photo of the QR, or type the pass code or vehicle number below.</p>
                </>
              )}
              {camera !== "starting" && (
                <button type="button" onClick={() => { setCamera("starting"); setCameraKey(k => k + 1); }}
                  className="mt-4 px-4 py-2 rounded-full bg-white text-slate-900 text-xs font-black uppercase tracking-widest">Try camera again</button>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pt-4 pb-6 space-y-3">
          {(error || photoError) && (
            <p role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm font-bold text-red-700">{error || photoError}</p>
          )}

          <form onSubmit={submitManual} className="flex gap-2">
            <input value={manual} onChange={e => setManual(e.target.value)} placeholder="Pass code or vehicle number" maxLength={40}
              aria-label="Pass code or vehicle number"
              className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none uppercase font-mono font-bold text-slate-800 placeholder:normal-case placeholder:font-sans placeholder:font-medium" />
            <button type="submit" disabled={!manual.trim() || busy}
              className="px-4 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40">Find</button>
          </form>

          <label className="block text-center text-xs font-bold text-blue-700 hover:text-blue-900 cursor-pointer">
            Read the QR from a photo instead
            <input type="file" accept="image/*" className="sr-only" onChange={e => { readPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      </div>
    </div>,
    document.body,
  );
}
