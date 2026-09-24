"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import BrandMark from "@/components/BrandMark";
import { RouteLoading } from "@/components/ui/AppLoading";
import { apiFetch, readApiError } from "@/lib/api";

function ResetForm() {
  const sp = useSearchParams();
  const [token, setToken] = useState(sp.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await apiFetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: password, confirmPassword: confirm }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Pemulihan gagal."));
      return;
    }
    setMessage(body.data?.message || "Kata sandi berhasil diubah.");
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4">
      <h1 className="font-display text-3xl text-ink">Atur kata sandi baru</h1>
      <label className="block text-sm">
        Token
        <input className="mt-1 w-full rounded bg-white p-2" value={token} onChange={(e) => setToken(e.target.value)} required autoComplete="off" />
      </label>
      <label className="block text-sm">
        Kata sandi baru
        <input className="mt-1 w-full rounded bg-white p-2" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={10} />
      </label>
      <label className="block text-sm">
        Konfirmasi
        <input className="mt-1 w-full rounded bg-white p-2" type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
      </label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={show} onChange={() => setShow((v) => !v)} /> Tampilkan kata sandi</label>
      {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      {message ? <p role="status">{message} <Link className="text-gold-700 underline" href="/login">Masuk</Link></p> : null}
      <button type="submit" className="min-h-11 rounded-full bg-gold-500 px-4 font-semibold text-white">Simpan</button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="auth-shell min-h-screen p-6">
      <BrandMark />
      <Suspense fallback={<RouteLoading />}>
        <ResetForm />
      </Suspense>
    </main>
  );
}
