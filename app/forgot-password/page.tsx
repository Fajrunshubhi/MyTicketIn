"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { apiFetch, readApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await apiFetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 202) {
      setError(readApiError(body, "Permintaan pemulihan gagal."));
      return;
    }
    setMessage(body.data?.message || "Jika akun memenuhi syarat, instruksi pemulihan akan dikirim.");
  }

  return (
    <main className="auth-shell min-h-screen p-6">
      <BrandMark />
      <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4">
        <h1 className="font-display text-3xl text-ink">Lupa kata sandi</h1>
        <p className="text-ink/65">Kami tidak akan memberitahu apakah email terdaftar. SANDBOX/UJI.</p>
        <label className="block text-sm">
          Email
          <input className="mt-1 w-full rounded bg-white p-2" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {error ? <p role="alert" className="text-red-700">{error}</p> : null}
        {message ? <p role="status">{message}</p> : null}
        <button type="submit" className="min-h-11 rounded-full bg-gold-500 px-4 font-semibold text-white">Kirim instruksi</button>
        <p><Link className="text-gold-700 underline" href="/login">Kembali masuk</Link></p>
      </form>
    </main>
  );
}
