"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/shared/AppHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Input } from "@/components/ui/Input";
import { apiFetch, readApiError } from "@/lib/api";
import { TicketHolderBiodata, type TicketHolder } from "@/components/checkin/TicketHolderBiodata";

type Access = {
  event?: { id: string; title: string; startsAt: string; timezone: string; venueName: string };
  permissions?: { scan: boolean; manualEntry: boolean };
};

type CheckResult = {
  attemptId: string;
  result: "VALID" | "ALREADY_USED" | "INVALID" | "CANCELLED" | "WRONG_EVENT";
  reasonCode: string;
  message: string;
  firstUsedAt?: string;
  ticket?: {
    ticketNumber?: string;
    ticketNumberMasked?: string;
    ticketTypeName?: string;
    sectionName?: string;
    seatLabel?: string;
    holder?: TicketHolder | null;
  };
  serverTime: string;
};

type ScanState = "IDLE" | "REQUESTING_PERMISSION" | "SCANNING" | "SUBMITTING" | "SHOWING_RESULT" | "NETWORK_ERROR";

const RESULT_LABEL: Record<string, string> = {
  VALID: "Valid",
  ALREADY_USED: "Sudah digunakan",
  INVALID: "Tidak valid",
  CANCELLED: "Dibatalkan",
  WRONG_EVENT: "Event salah",
};

function newKey(): string {
  const raw = crypto.randomUUID().replace(/-/g, "");
  return raw.length >= 16 ? raw : `${raw}idempotencyxx`;
}

export default function ScannerPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const eventId = params.id;
  const staffMode = pathname.startsWith("/petugas");
  const embedded = pathname.startsWith("/dashboard") || staffMode;
  const eventHref = staffMode ? `/petugas/event/${eventId}` : `/dashboard/event/${eventId}`;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<{ stop: () => void } | null>(null);
  const inFlight = useRef(false);
  const lastToken = useRef({ value: "", at: 0 });
  const keyRef = useRef(newKey());

  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState("");
  const [state, setState] = useState<ScanState>("IDLE");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [camMsg, setCamMsg] = useState("");

  useEffect(() => {
    apiFetch(`/api/events/${eventId}/scanner-access`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(readApiError(body, "Anda tidak dapat membuka scanner event ini."));
          return;
        }
        setAccess(body.data as Access);
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."));
  }, [eventId]);

  const stopCamera = useCallback(() => {
    readerRef.current?.stop();
    readerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState !== "visible") stopCamera();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stopCamera();
    };
  }, [stopCamera]);

  async function submit(inputType: "QR_TOKEN" | "MANUAL_CODE", value: string, retry: boolean) {
    if (inFlight.current) return;
    const now = Date.now();
    if (!retry && inputType === "QR_TOKEN" && value === lastToken.current.value && now - lastToken.current.at < 3000) {
      return;
    }
    inFlight.current = true;
    setState("SUBMITTING");
    if (!retry) keyRef.current = newKey();
    try {
      const res = await apiFetch(`/api/events/${eventId}/check-ins`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": keyRef.current },
        body: JSON.stringify({
          inputType,
          value,
          clientContext: { scannerVersion: "web-1", cameraFacing: "environment", browserFamily: navigator.userAgent.slice(0, 40) },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("NETWORK_ERROR");
        setError(readApiError(body, "Check-in gagal. Coba lagi dengan koneksi aktif."));
        return;
      }
      const data = body.data as CheckResult;
      setResult(data);
      setError("");
      setState("SHOWING_RESULT");
      lastToken.current = { value, at: Date.now() };
      if (data.result === "VALID" && navigator.vibrate) navigator.vibrate(80);
    } catch {
      setState("NETWORK_ERROR");
      setError("Jaringan terputus. Tiket di server tidak diubah. Coba kirim ulang.");
    } finally {
      inFlight.current = false;
    }
  }

  async function startCamera() {
    setCamMsg("");
    setState("REQUESTING_PERMISSION");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const zxing = await import("@zxing/browser");
      const reader = new zxing.BrowserMultiFormatReader();
      setState("SCANNING");
      const controls = await reader.decodeFromStream(stream, videoRef.current!, (res) => {
        const text = res?.getText();
        if (text) void submit("QR_TOKEN", text, false);
      });
      readerRef.current = { stop: () => controls.stop() };
    } catch (e) {
      setState("IDLE");
      setShowManual(true);
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError") setCamMsg("Izin kamera ditolak. Gunakan kode manual.");
      else if (name === "NotFoundError") setCamMsg("Kamera tidak ditemukan. Gunakan kode manual.");
      else setCamMsg("Kamera tidak dapat dipakai. Gunakan kode manual.");
    }
  }

  function resetScan() {
    setResult(null);
    setError("");
    setState(streamRef.current ? "SCANNING" : "IDLE");
  }

  const inner = (
    <>
        <h1 className="font-display text-3xl text-ink">Scanner check-in</h1>
        <p className="mt-2 text-lg text-gold-700" role="status">
          {access?.event?.title || "Memuat event…"}
        </p>
        {access?.event ? (
          <p className="text-ink/70">
            {access.event.venueName} · {access.event.timezone}
          </p>
        ) : null}
        {error ? (
          <div className="mt-4">
            <Alert tone="error" title={error} />
            {state === "NETWORK_ERROR" ? (
              <Button className="mt-3" onClick={() => result && submit("QR_TOKEN", lastToken.current.value, true)}>
                Kirim ulang
              </Button>
            ) : null}
          </div>
        ) : null}
        {camMsg ? <p className="mt-3 text-ink/80">{camMsg}</p> : null}
        <section className="mt-6 space-y-4">
          <video ref={videoRef} className="aspect-square w-full max-w-sm rounded-xl bg-black" playsInline muted aria-label="Pratinjau kamera scanner" />
          {state === "IDLE" || state === "REQUESTING_PERMISSION" ? (
            <Button onClick={startCamera} loading={state === "REQUESTING_PERMISSION"}>
              Aktifkan kamera
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => setShowManual(true)}>Masukkan kode manual</Button>
        </section>
        {showManual ? (
          <form
            className="mt-6 max-w-sm space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit("MANUAL_CODE", manual, false);
            }}
          >
            <Input
              id="manual-code"
              label="Kode cadangan 16 karakter"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              autoComplete="off"
              placeholder="Contoh: A5943CACA9C778F1"
            />
            <p className="text-xs text-ink/55">Gunakan kode cadangan pada tiket, bukan nomor tiket yang berawalan T.</p>
            <Button type="submit" loading={state === "SUBMITTING"}>Kirim kode</Button>
          </form>
        ) : null}
        {result && state === "SHOWING_RESULT" ? (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/50 p-4" role="alertdialog" aria-modal="true">
            <div
              className={`w-full max-w-md rounded-2xl border p-6 shadow-lg ${
                result.result === "VALID"
                  ? "border-emerald-300 bg-white"
                  : result.result === "ALREADY_USED"
                    ? "border-amber-300 bg-white"
                    : "border-red-300 bg-white"
              }`}
            >
              <Alert
                tone={result.result === "VALID" ? "success" : result.result === "ALREADY_USED" ? "warning" : "error"}
                title={
                  result.result === "ALREADY_USED"
                    ? "Anda sudah check-in"
                    : result.result === "VALID"
                      ? "Check-in berhasil"
                      : RESULT_LABEL[result.result]
                }
              >
                {result.message || (result.result === "ALREADY_USED" ? "Tiket sudah digunakan." : "")}
              </Alert>
              {result.ticket ? (
                <div className="mt-3">
                  <p className="text-sm text-ink/70">
                    {result.ticket.ticketNumberMasked || result.ticket.ticketNumber} · {result.ticket.ticketTypeName}
                    {result.ticket.seatLabel ? ` · ${result.ticket.seatLabel}` : ""}
                  </p>
                  <TicketHolderBiodata holder={result.ticket.holder} />
                </div>
              ) : null}
              <Button className="mt-4 w-full" onClick={resetScan}>
                Pindai berikutnya
              </Button>
            </div>
          </div>
        ) : null}
        {staffMode ? null : (
          <p className="mt-6">
            <Link className="text-gold-700 underline" href={`${eventHref}/check-in-attempts`}>
              Riwayat check-in
            </Link>
          </p>
        )}
    </>
  );

  if (embedded) {
    return <div>{inner}</div>;
  }

  return (
    <main id="konten-utama" className="auth-shell min-h-screen">
      <AppHeader homeHref="/dashboard" items={[{ href: eventHref, label: "Event" }]} />
      <Container>{inner}</Container>
    </main>
  );
}
