"use client";

import { useEffect, useRef, useState } from "react";

// The Web Speech API is not in TypeScript's DOM lib, so only the parts used here are declared.
type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type SpeechErrorEvent = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Izin mikrofon ditolak. Aktifkan izin mikrofon di browser.",
  "service-not-allowed": "Izin mikrofon ditolak. Aktifkan izin mikrofon di browser.",
  "no-speech": "Suara tidak terdengar. Coba ucapkan lagi.",
  "audio-capture": "Mikrofon tidak ditemukan.",
  network: "Pengenalan suara membutuhkan koneksi internet.",
};

/**
 * Speech is converted to text in the browser; only the text goes on to the normal natural-language search, which
 * validates it like typed input. The audio never reaches our server. (Chrome/Edge do send audio to their own
 * speech service, which is why the hint below says so.)
 */
export function VoiceSearchButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(recognitionCtor() !== null);
    return () => recRef.current?.abort();
  }, []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "id-ID";
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let heard = "";
    rec.onresult = (e) => {
      heard = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted") setMessage(ERRORS[e.error] || "Pengenalan suara gagal. Coba lagi atau ketik pencarian.");
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (heard) onTranscript(heard.slice(0, 300));
    };
    recRef.current = rec;
    setMessage("");
    try {
      rec.start();
      setListening(true);
    } catch {
      setMessage("Pengenalan suara gagal dimulai. Coba lagi.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        aria-label={listening ? "Berhenti mendengarkan" : "Cari dengan suara"}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold ${
          listening ? "border-red-500 bg-red-50 text-red-700" : "border-stone-300 bg-white text-ink hover:bg-stone-50"
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
        </svg>
        {listening ? "Mendengarkan…" : "Suara"}
      </button>
      <p className="sr-only" role="status">
        {listening ? "Mendengarkan. Ucapkan pencarian Anda." : message}
      </p>
      {message ? (
        <p className="text-sm text-amber-800 sm:col-span-full" role="alert">
          {message}
        </p>
      ) : null}
    </>
  );
}
