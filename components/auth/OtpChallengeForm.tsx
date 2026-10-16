"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { apiFetch, readApiError, type ApiError } from "@/lib/api";

export type OtpChallenge = {
  challengeId: string;
  emailHint: string;
  sandboxCode?: string;
};

export function OtpChallengeForm({
  challenge,
  onChallenge,
  onSuccess,
  submitLabel = "Verifikasi",
}: {
  challenge: OtpChallenge;
  onChallenge: (next: OtpChallenge) => void;
  onSuccess: (data: { nextPath?: string }) => void;
  submitLabel?: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const res = await apiFetch("/api/auth/otp/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: challenge.challengeId, code }),
    });
    const payload = (await res.json().catch(() => ({}))) as ApiError & { data?: { nextPath?: string } };
    setLoading(false);
    if (!res.ok) {
      setError(readApiError(payload, "Kode OTP tidak valid."));
      return;
    }
    onSuccess(payload.data || {});
  }

  async function resend() {
    setError("");
    setResending(true);
    const res = await apiFetch("/api/auth/otp/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: challenge.challengeId }),
    });
    const payload = (await res.json().catch(() => ({}))) as ApiError & {
      data?: OtpChallenge;
    };
    setResending(false);
    if (!res.ok) {
      setError(readApiError(payload, "Tidak dapat mengirim ulang kode."));
      return;
    }
    if (payload.data?.challengeId) onChallenge(payload.data);
    setCode("");
  }

  return (
    <form onSubmit={confirm} className="grid gap-3" noValidate>
      <p className="text-sm text-ink/70">
        Kode 6 digit dikirim ke <span className="font-medium text-ink">{challenge.emailHint}</span>. Berlaku 10 menit.
      </p>
      {challenge.sandboxCode ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
          Kode OTP: <strong className="font-mono tracking-widest">{challenge.sandboxCode}</strong>
        </p>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-sm text-ink/70">Kode OTP</span>
        <input
          className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-center font-mono text-lg tracking-[0.4em] text-ink"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
        />
      </label>
      {error ? (
        <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={loading} className="w-full" disabled={code.length !== 6}>
        {submitLabel}
      </Button>
      <button
        type="button"
        className="text-sm font-medium text-gold-700 underline-offset-2 hover:underline disabled:opacity-50"
        disabled={resending}
        onClick={() => void resend()}
      >
        {resending ? "Mengirim ulang…" : "Kirim ulang kode"}
      </button>
    </form>
  );
}
