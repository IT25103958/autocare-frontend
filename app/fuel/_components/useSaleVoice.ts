"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The part of the browser's Web Speech API used here.
interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognizerCtor = new () => Recognizer;

// "unclear": nothing usable was heard. "blocked": no microphone, or the browser
// refused it. "offline": the recogniser couldn't reach its service.
export type VoiceProblem = "unclear" | "blocked" | "offline";

// Closer to local pronunciation than the browser's default en-US.
const DEFAULT_LANG = "en-IN";
const SINHALA_LANG = "si-LK";

// Recognition only exists in some browsers (not Firefox) and only on HTTPS or
// localhost. Neither is something the attendant can fix, so callers simply
// don't show a mic when this is null.
function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// One spoken phrase per tap of the mic. It only reports what was heard — filling
// the form, and never submitting it, is the caller's job.
export function useSaleVoice(options: { sinhala: boolean; onHeard: (transcript: string) => void; onProblem: (problem: VoiceProblem) => void }) {
  const [listening, setListening] = useState(false);
  const active = useRef<Recognizer | null>(null);
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });

  const stop = useCallback(() => {
    const rec = active.current;
    if (!rec) return;
    active.current = null;
    rec.onresult = rec.onerror = rec.onend = null;
    rec.abort();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recognizerCtor();
    if (!Ctor || active.current) return;

    const run = (lang: string) => {
      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let heard = false;
      let retryInEnglish = false;
      let problem: VoiceProblem = "unclear";

      rec.onresult = (e) => {
        const transcript = e.results[0]?.[0]?.transcript ?? "";
        if (!transcript.trim()) return;
        heard = true;
        latest.current.onHeard(transcript);
      };
      rec.onerror = (e) => {
        // Sinhala isn't available everywhere: fall back quietly instead of showing an error.
        if (e.error === "language-not-supported" && lang !== DEFAULT_LANG) retryInEnglish = true;
        else if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") problem = "blocked";
        else if (e.error === "network") problem = "offline";
      };
      rec.onend = () => {
        if (retryInEnglish) {
          run(DEFAULT_LANG);
          return;
        }
        active.current = null;
        setListening(false);
        if (!heard) latest.current.onProblem(problem);
      };

      active.current = rec;
      setListening(true);
      try {
        rec.start();
      } catch {
        active.current = null;
        setListening(false);
        latest.current.onProblem("unclear");
      }
    };

    run(latest.current.sinhala ? SINHALA_LANG : DEFAULT_LANG);
  }, []);

  useEffect(() => stop, [stop]);

  return { supported: recognizerCtor() !== null, listening, start, stop };
}
