"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { apiFetch, readApiError, type ApiError } from "@/lib/api";
import { roleLabel, type AccountProfile } from "@/lib/account";

const fieldClass =
  "w-full h-11 min-h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm text-ink outline-none focus:ring-2";

export function ProfileForm() {
  const router = useRouter();
  const [me, setMe] = useState<AccountProfile | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const body = (await res.json()) as { data?: AccountProfile };
        if (body.data) {
          setMe(body.data);
          setName(body.data.name);
          setEmail(body.data.email);
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved("");
    setFieldErrors({});
    setLoading(true);
    const response = await apiFetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const payload = (await response.json().catch(() => ({}))) as ApiError & { data?: AccountProfile };
    setLoading(false);
    if (!response.ok) {
      setFieldErrors(payload.error?.fieldErrors || {});
      setError(readApiError(payload, "Profil tidak dapat disimpan."));
      return;
    }
    if (payload.data) {
      setMe(payload.data);
      setName(payload.data.name);
      setEmail(payload.data.email);
    }
    setSaved("Profil berhasil disimpan.");
  }

  if (!me) {
    return (
      <div className="px-6 py-10">
        <p role="status">Memuat profil…</p>
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-6 pb-16">
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-paper p-8 shadow-card md:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-gold-700">Profil</p>
        <h1 className="font-display mt-4 text-4xl text-ink">Edit profil</h1>
        <p className="mt-3 text-ink/65">Ubah nama tampilan dan email. Username dan peran tidak dapat diubah di sini.</p>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <dt className="flex items-center gap-2 text-sm text-ink/45">
              <Icon name="user" className="h-4 w-4" />
              Username
            </dt>
            <dd className="mt-1 text-ink">{me.username}</dd>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <dt className="flex items-center gap-2 text-sm text-ink/45">
              <Icon name="shield" className="h-4 w-4" />
              Peran
            </dt>
            <dd className="mt-1 text-ink">{roleLabel(me)}</dd>
          </div>
        </dl>

        <form className="mt-8 space-y-4" onSubmit={onSubmit} noValidate>
          <label className="block text-sm">
            <span className="font-medium text-ink">Nama</span>
            <input className={`${fieldClass} mt-1`} name="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" />
            {fieldErrors.name ? <span className="mt-1 block text-sm text-red-700">{fieldErrors.name}</span> : null}
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Email</span>
            <input className={`${fieldClass} mt-1`} name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            {fieldErrors.email ? <span className="mt-1 block text-sm text-red-700">{fieldErrors.email}</span> : null}
          </label>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="text-sm text-emerald-800">
              {saved}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Menyimpan…" : "Simpan"}
            </Button>
            <a href="/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-ink/80 hover:bg-white">
              Kembali ke dashboard
            </a>
          </div>
        </form>
      </div>
    </section>
  );
}
