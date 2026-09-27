"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { RouteLoading } from "@/components/ui/AppLoading";
import { Button } from "@/components/ui/Button";
import { apiFetch, readApiError } from "@/lib/api";

const fieldClass =
  "w-full h-11 min-h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm text-ink outline-none ring-gold-500/40 placeholder:text-ink/30 focus:ring-2";

function strengthLabel(password: string) {
  if (password.length === 0) return "";
  if (password.length < 10) return "Terlalu pendek. Minimal 10 karakter.";
  if (password.length < 14) return "Cukup. Lebih panjang lebih aman.";
  return "Panjang kata sandi sudah baik.";
}

function ResetForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [token, setToken] = useState(() => (sp.get("token") || "").trim());
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = (sp.get("token") || "").trim();
    if (!raw) return;
    setToken(raw);
    router.replace("/reset-password", { scroll: false });
  }, [router, sp]);

  const hint = useMemo(() => strengthLabel(password), [password]);
  const mismatch = confirm.length > 0 && password !== confirm;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("Tautan pemulihan tidak lengkap. Minta tautan baru.");
      return;
    }
    if (password.length < 10 || password.length > 128 || password !== confirm) {
      setError("Kata sandi wajib 10–128 karakter dan konfirmasi harus sama.");
      return;
    }
    setLoading(true);
    const res = await apiFetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: password, confirmPassword: confirm }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(readApiError(body, "Tautan pemulihan tidak valid atau sudah dipakai."));
      return;
    }
    setMessage(body.data?.message || "Kata sandi berhasil diubah. Silakan masuk kembali.");
  }

  return (
    <div className="w-full max-w-md min-w-0">
      <div className="lg:hidden">
        <BrandMark compact />
      </div>
      <h2 className="pt-2 text-2xl font-semibold tracking-tight text-ink">Atur kata sandi baru</h2>
      <p className="mt-1 text-sm text-ink/60">
        Buat kata sandi 10–128 karakter. Setelah berhasil, semua sesi aktif akan keluar.
      </p>

      {!token && !message ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
          Tautan tidak lengkap atau sudah dibersihkan dari alamat. Minta tautan baru dari halaman lupa kata sandi.
        </div>
      ) : null}

      {message ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          <p className="font-semibold">Kata sandi diperbarui</p>
          <p className="mt-1">{message}</p>
          <Link href="/login" className="mt-3 inline-flex min-h-11 items-center font-semibold text-gold-800 hover:underline">
            Masuk dengan kata sandi baru
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
          <input type="hidden" name="token" value={token} autoComplete="off" />
          <label className="block">
            <span className="mb-1 block text-sm text-ink/70">Kata sandi baru</span>
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass}
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
            />
            {hint ? <p className="mt-1 text-xs text-ink/55">{hint}</p> : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-ink/70">Konfirmasi kata sandi</span>
            <input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={fieldClass}
              autoComplete="new-password"
              required
            />
            {mismatch ? (
              <p className="mt-1 text-xs text-red-700" role="alert">
                Konfirmasi belum sama.
              </p>
            ) : null}
          </label>
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={show} onChange={() => setShow((v) => !v)} />
            Tampilkan kata sandi
          </label>
          {error ? (
            <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={loading} disabled={!token || loading} className="w-full">
            Simpan kata sandi
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-ink/60">
        <Link href="/forgot-password" className="font-semibold text-gold-700 hover:text-gold-800">
          Minta tautan baru
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="auth-shell auth-lock grid min-h-dvh lg:grid-cols-2">
      <section className="hero-stage relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <BrandMark compact onDark />
        <div>
          <p className="mb-3 text-md font-medium uppercase tracking-[0.28em] text-white/70">Keamanan akun</p>
          <h1 className="max-w-xl text-5xl font-semibold leading-tight tracking-tight">Tautan ini hanya berlaku satu kali</h1>
          <p className="mt-4 max-w-lg text-base text-white/75">
            Setelah kata sandi diganti, tautan lama tidak dapat dipakai lagi dan sesi masuk sebelumnya diakhiri.
          </p>
        </div>
        <p className="text-sm text-white/50">@ 2026 MYTICKETIN. Hak cipta dilindungi undang-undang</p>
      </section>
      <section className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8">
        <Suspense fallback={<RouteLoading />}>
          <ResetForm />
        </Suspense>
      </section>
    </main>
  );
}
