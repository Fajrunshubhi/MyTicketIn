"use client";

import type { ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import BrandMark from "@/components/BrandMark";
import GoogleButton from "@/components/GoogleButton";
import { googleCallbackForPortal } from "@/components/auth/PortalChoice";
import { apiFetch, readApiError, type ApiError } from "@/lib/api";

type RegisterFormState = {
  name: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const initialForm: RegisterFormState = {
  name: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

const fieldClass =
  "w-full h-11 min-h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm text-ink outline-none focus:ring-2";

export default function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState<RegisterFormState>(initialForm);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include", cache: "no-store" })
      .then((res) => res.json())
      .then((data: { user?: { id?: string; nextPath?: string; access?: { canOrganize?: boolean } } }) => {
        if (!data.user?.id) {
          return;
        }
        const next = data.user.nextPath || "/";
        router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
      })
      .catch(() => undefined);
  }, [router]);

  function updateField(field: keyof RegisterFormState) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    setLoading(true);
    const response = await apiFetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, intent: "buyer" }),
    });
    const payload = (await response.json().catch(() => ({}))) as ApiError & {
      data?: { username?: string; nextPath?: string };
    };
    if (!response.ok) {
      setLoading(false);
      setFieldErrors(payload.error?.fieldErrors || {});
      setError(readApiError(payload, "Pendaftaran gagal."));
      return;
    }
    const login = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: form.username, password: form.password, portal: "buyer" }),
    });
    setLoading(false);
    if (!login.ok) {
      setError("Akun berhasil dibuat. Silakan masuk dengan username dan kata sandi Anda.");
      return;
    }
    const loginBody = (await login.json().catch(() => ({}))) as { data?: { nextPath?: string } };
    const next = loginBody.data?.nextPath || payload.data?.nextPath || "/";
    router.push(next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  return (
    <main className="auth-shell auth-lock grid h-dvh max-h-dvh overflow-hidden lg:grid-cols-2">
      <section className="hero-stage relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <BrandMark compact onDark />
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.28em] text-white/70">Aplikasi MyTicketIn</p>
          <h1 className="max-w-xl text-5xl font-semibold leading-tight tracking-tight">Bergabung.</h1>
          <p className="mt-4 max-w-lg text-base text-white/75">
            Pendaftaran hanya untuk pembeli tiket. Pengajuan sebagai penyelenggara dilakukan setelah Anda masuk.
          </p>
        </div>
        <p className="text-sm text-white/50">UJI / SANDBOX</p>
      </section>

      <section className="flex h-dvh max-h-dvh items-center justify-center overflow-hidden px-4 py-3 sm:px-8">
        <div className="w-full max-w-md min-w-0">
          <div className="lg:hidden">
            <BrandMark compact />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Buat akun</h2>
          <p className="mt-1 text-sm text-ink/60">Kata sandi 10–128 karakter. Hanya untuk pembeli tiket.</p>
          <form onSubmit={handleSubmit} className="mt-4 grid gap-2.5" noValidate>
            <GoogleButton portal="buyer" callbackUrl={googleCallbackForPortal("buyer")} />
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-ink/45">
              <span className="h-px flex-1 bg-stone-300" />
              atau
              <span className="h-px flex-1 bg-stone-300" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block min-w-0">
                <span className="mb-1 block text-sm text-ink/70">Nama lengkap</span>
                <input
                  value={form.name}
                  onChange={updateField("name")}
                  className={fieldClass}
                  autoComplete="name"
                  required
                />
                {fieldErrors.name ? <p className="mt-0.5 text-xs text-red-700" role="alert">{fieldErrors.name}</p> : null}
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-sm text-ink/70">Username</span>
                <input
                  value={form.username}
                  onChange={updateField("username")}
                  className={fieldClass}
                  autoComplete="username"
                  required
                />
                {fieldErrors.username ? (
                  <p className="mt-0.5 text-xs text-red-700" role="alert">{fieldErrors.username}</p>
                ) : null}
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm text-ink/70">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={updateField("email")}
                className={fieldClass}
                autoComplete="email"
                required
              />
              {fieldErrors.email ? <p className="mt-0.5 text-xs text-red-700" role="alert">{fieldErrors.email}</p> : null}
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block min-w-0">
                <span className="mb-1 block text-sm text-ink/70">Kata sandi</span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={updateField("password")}
                  className={fieldClass}
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                />
                {fieldErrors.password ? (
                  <p className="mt-0.5 text-xs text-red-700" role="alert">{fieldErrors.password}</p>
                ) : null}
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-sm text-ink/70">Konfirmasi</span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={updateField("confirmPassword")}
                  className={fieldClass}
                  autoComplete="new-password"
                  required
                />
                {fieldErrors.confirmPassword ? (
                  <p className="mt-0.5 text-xs text-red-700" role="alert">{fieldErrors.confirmPassword}</p>
                ) : null}
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={showPassword} onChange={() => setShowPassword((v) => !v)} />
              Tampilkan kata sandi
            </label>
            {error ? (
              <p className="line-clamp-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            <p aria-live="polite" className="sr-only">
              {loading ? "Membuat akun" : ""}
            </p>
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-11 rounded-full bg-gold-500 px-4 font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Membuat akun..." : "Daftar"}
            </button>
          </form>
          <p className="mt-3 text-center text-sm text-ink/60">
            Sudah punya akun?{" "}
            <Link href="/login?portal=buyer" className="font-semibold text-gold-700 hover:text-gold-800">
              Masuk
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
