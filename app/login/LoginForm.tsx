"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import BrandMark from "@/components/BrandMark";
import GoogleButton from "@/components/GoogleButton";
import { PortalChoice, googleCallbackForPortal, type AuthPortal } from "@/components/auth/PortalChoice";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { apiFetch, readApiError } from "@/lib/api";

const oauthMessages: Record<string, string> = {
  AUTH_ACCOUNT_LINK_REQUIRED: "Email Google sudah terdaftar. Masuk dengan username dan kata sandi, lalu tautkan Google.",
  AUTH_OAUTH_FAILED: "Login Google gagal. Gunakan login lokal.",
  AUTH_INVALID_CREDENTIALS: "Username atau kata sandi salah.",
  AUTH_CSRF_INVALID: "Permintaan tidak valid. Muat ulang halaman.",
  AUTH_PORTAL_DENIED: "Jenis akun tidak cocok dengan portal yang dipilih.",
};

const portalDeniedReasons: Record<string, string> = {
  not_admin: "Akun ini bukan admin aplikasi.",
  admin_only: "Akun admin harus masuk melalui portal Admin aplikasi.",
  organizer_only: "Akun ini adalah penyelenggara event. Masuk melalui portal Penyelenggara event.",
  apply_after_login: "Masuk sebagai pembeli tiket. Pengajuan sebagai penyelenggara dilakukan setelah Anda masuk.",
  staff_mismatch: "Akun petugas tidak terdaftar pada penyelenggara ini.",
};

function parsePortal(raw: string | null): AuthPortal {
  if (raw === "organizer" || raw === "admin" || raw === "buyer" || raw === "staff") {
    return raw;
  }
  return "buyer";
}

type LoginData = {
  nextPath?: string;
  role?: string;
  access?: { isAdmin?: boolean; kind?: string; canOrganize?: boolean };
};

type SessionUser = {
  id?: string;
  role?: string;
  nextPath?: string;
  access?: { isAdmin?: boolean; kind?: string; canOrganize?: boolean };
};

function sessionAllowsPortal(user: SessionUser, portal: AuthPortal): boolean {
  const admin = Boolean(user.access?.isAdmin || user.role === "ADMIN");
  const organizer = Boolean(user.access?.canOrganize);
  const staff = user.access?.kind === "staff";
  if (portal === "admin") return admin;
  if (admin) return false;
  if (portal === "staff") return staff;
  if (portal === "buyer") return !organizer && !staff;
  if (portal === "organizer") return organizer;
  return false;
}

const fieldClass =
  "w-full h-11 min-h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm text-ink outline-none ring-gold-500/40 placeholder:text-ink/30 focus:ring-2";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [portal, setPortal] = useState<AuthPortal>(() => parsePortal(params.get("portal")));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [organizerId, setOrganizerId] = useState("");
  const [organizers, setOrganizers] = useState<{ id: string; name: string }[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPortal(parsePortal(params.get("portal")));
  }, [params]);

  useEffect(() => {
    const code = params.get("error") || "";
    if (code === "AUTH_PORTAL_DENIED") {
      const reason = params.get("reason") || "";
      if (/petugas tidak terdaftar/i.test(reason)) {
        setError(portalDeniedReasons.staff_mismatch);
        return;
      }
      setError(portalDeniedReasons[reason] || reason || oauthMessages.AUTH_PORTAL_DENIED);
      return;
    }
    if (code && oauthMessages[code]) {
      setError(oauthMessages[code]);
    }
  }, [params]);

  useEffect(() => {
    if (portal !== "staff") return;
    apiFetch("/api/public/organizers")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        setOrganizers((body.data?.items || []) as { id: string; name: string }[]);
      })
      .catch(() => setOrganizers([]));
  }, [portal]);

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include", cache: "no-store" })
      .then((res) => res.json())
      .then((data: { user?: SessionUser }) => {
        if (!data.user?.id) {
          return;
        }
        const fallback = data.user.access?.kind === "staff" ? "/petugas" : data.user.access?.isAdmin ? "/dashboard" : "/";
        const next = data.user.nextPath || fallback;
        router.replace(next.startsWith("/") && !next.startsWith("//") ? next : fallback);
      })
      .catch(() => undefined);
  }, [router, portal]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const selected = parsePortal(String(new FormData(event.currentTarget).get("portal") || portal));
    setPortal(selected);
    if (selected === "staff" && !organizerId) {
      setError("Pilih penyelenggara terlebih dahulu.");
      return;
    }
    setLoading(true);
    const callbackUrl = params.get("callbackUrl") || "";
    const response = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        portal: selected,
        callbackUrl,
        organizerId: selected === "staff" ? organizerId : undefined,
      }),
    });
    const payload: unknown = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(readApiError(payload, selected === "staff" ? portalDeniedReasons.staff_mismatch : "Username atau kata sandi salah."));
      return;
    }
    const data = (payload as { data?: LoginData }).data;
    if (!sessionAllowsPortal({ role: data?.role, access: data?.access }, selected)) {
      await apiFetch("/api/auth/signout", { method: "POST" }).catch(() => undefined);
      const reason =
        selected === "staff"
          ? portalDeniedReasons.staff_mismatch
          : selected === "organizer"
            ? portalDeniedReasons.apply_after_login
            : selected === "admin"
              ? portalDeniedReasons.not_admin
              : portalDeniedReasons.organizer_only;
      setError(reason);
      return;
    }
    const fallback = selected === "admin" ? "/dashboard" : selected === "staff" ? "/petugas" : "/";
    const next = data?.nextPath || fallback;
    router.push(next.startsWith("/") && !next.startsWith("//") ? next : fallback);
    router.refresh();
  }

  return (
    <main className="auth-shell auth-lock grid h-dvh max-h-dvh overflow-hidden lg:grid-cols-2">
      <section className="hero-stage relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <BrandMark compact onDark />
        <div>
          <p className="mb-3 text-md font-medium uppercase tracking-[0.28em] text-white/70">Aplikasi MyTicketIn</p>
          <h1 className="max-w-xl text-5xl font-semibold leading-tight tracking-tight">Ticketing Event untuk Pemesanan, Pembayaran, dan Validasi Peserta</h1>
          <p className="mt-4 max-w-lg text-base text-white/75">Masuk untuk mulai menggunakan MyTicketIn</p>
        </div>
        <p className="text-sm text-white/50">@ 2026 MYTICKETIN. Hak Cipta dilindungi undang-undang</p>
      </section>

      <section className="flex h-dvh max-h-dvh items-center justify-center overflow-hidden px-4 py-3 sm:px-8">
        <div className="w-full max-w-md min-w-0">
          <div className="lg:hidden">
            <BrandMark compact />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink pt2">Masuk</h2>
          <p className="mt-1 text-sm text-ink/60">
            {portal === "staff"
              ? "Portal petugas hanya untuk masuk. Pendaftaran dilakukan oleh penyelenggara."
              : "Pilih portal, gunakan akun gmail atau username dan kata sandi."}
          </p>
          <form onSubmit={handleSubmit} className="mt-4 grid gap-2.5" noValidate>
            <PortalChoice name="portal" legend="Masuk sebagai" includeAdmin value={portal} onChange={setPortal} />
            {portal === "staff" ? (
              <Select
                label="Penyelenggara"
                name="organizerId"
                value={organizerId}
                onChange={(event) => setOrganizerId(event.target.value)}
                required
              >
                <option value="">Pilih penyelenggara</option>
                {organizers.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </Select>
            ) : (
              <GoogleButton portal={portal} callbackUrl={params.get("callbackUrl") || googleCallbackForPortal(portal)} />
            )}
            {portal === "staff" ? null : (
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-ink/45">
                <span className="h-px flex-1 bg-stone-300" />
                atau
                <span className="h-px flex-1 bg-stone-300" />
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-sm text-ink/70">{portal === "staff" ? "Username petugas" : "Username atau email"}</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className={fieldClass}
                autoComplete="username"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-ink/70">Kata sandi</span>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={fieldClass}
                autoComplete="current-password"
                required
              />
            </label>
            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-2 text-ink/70">
                <input type="checkbox" checked={showPassword} onChange={() => setShowPassword((v) => !v)} />
                Tampilkan kata sandi
              </label>
              {portal === "staff" ? null : (
                <Link href="/forgot-password" className="text-gold-700 underline">
                  Lupa kata sandi?
                </Link>
              )}
            </div>
            {error ? (
              <p className="line-clamp-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" loading={loading} className="w-full">
              Masuk
            </Button>
          </form>
          {portal === "staff" ? (
            <p className="mt-3 text-center text-sm text-ink/60">Petugas tidak dapat mendaftar sendiri.</p>
          ) : (
            <p className="mt-3 text-center text-sm text-ink/60">
              Belum punya akun?{" "}
              <Link href="/register" className="font-semibold text-gold-700 hover:text-gold-800">
                Daftar
              </Link>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
