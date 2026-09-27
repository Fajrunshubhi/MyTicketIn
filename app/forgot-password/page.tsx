"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/Button";
import { apiFetch, readApiError } from "@/lib/api";

const fieldClass =
  "w-full h-11 min-h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm text-ink outline-none ring-gold-500/40 placeholder:text-ink/30 focus:ring-2";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const res = await apiFetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok && res.status !== 202) {
      setError(readApiError(body, "Permintaan pemulihan gagal. Coba lagi beberapa saat."));
      return;
    }
    setMessage(
      body.data?.message ||
        "Jika alamat itu terdaftar sebagai akun lokal, kami mengirim tautan sekali pakai. Periksa kotak masuk dan folder spam.",
    );
  }

  return (
    <main className="auth-shell auth-lock grid min-h-dvh lg:grid-cols-2">
      <section className="hero-stage relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <BrandMark compact onDark />
        <div>
          <p className="mb-3 text-md font-medium uppercase tracking-[0.28em] text-white/70">Pemulihan akun</p>
          <h1 className="max-w-xl text-5xl font-semibold leading-tight tracking-tight">Atur ulang kata sandi dengan tautan sekali pakai</h1>
          <p className="mt-4 max-w-lg text-base text-white/75">
            Kami mengirim tautan ke email akun lokal. Tautan kedaluwarsa dalam 30 menit dan tidak dapat dipakai ulang.
          </p>
        </div>
        <p className="text-sm text-white/50">@ 2026 MYTICKETIN. Hak cipta dilindungi undang-undang</p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-md min-w-0">
          <div className="lg:hidden">
            <BrandMark compact />
          </div>
          <h2 className="pt-2 text-2xl font-semibold tracking-tight text-ink">Lupa kata sandi</h2>
          <p className="mt-1 text-sm text-ink/60">
            Masukkan email akun lokal. Kami tidak akan memberitahu apakah email terdaftar.
          </p>

          {message ? (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
              <p className="font-semibold">Permintaan diterima</p>
              <p className="mt-1 leading-relaxed">{message}</p>
              <p className="mt-2 text-emerald-800/80">Tautan berlaku 30 menit dan hanya untuk satu kali penggantian kata sandi.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
              <label className="block">
                <span className="mb-1 block text-sm text-ink/70">Email</span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={fieldClass}
                  placeholder="nama@email.com"
                  required
                />
              </label>
              {error ? (
                <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" loading={loading} className="w-full">
                Kirim tautan pemulihan
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-ink/60">
            Ingat kata sandi?{" "}
            <Link href="/login" className="font-semibold text-gold-700 hover:text-gold-800">
              Kembali masuk
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
