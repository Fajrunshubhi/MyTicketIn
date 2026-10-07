"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";
import { readApiError } from "@/lib/api";

type Item = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  href: string;
};
type Group = { type: string; label: string; items: Item[]; hasMore: boolean };

const TYPES: { value: string; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "users", label: "Pengguna" },
  { value: "organizers", label: "Organizer" },
  { value: "events", label: "Event" },
  { value: "orders", label: "Order" },
  { value: "payments", label: "Pembayaran" },
  { value: "tickets", label: "Tiket" },
];

export default function AdminSearchClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = (sp.get("q") || "").trim();
  const type = sp.get("type") || "all";
  const page = Math.max(1, Number(sp.get("page") || 1) || 1);
  const [input, setInput] = useState(q);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    if (q.length < 2) {
      setGroups(null);
      setError("");
      return;
    }
    let cancelled = false;
    setGroups(null);
    setError("");
    fetch(`/api/admin/search?${sp.toString()}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401)
          return router.replace("/login?callbackUrl=/admin/search");
        if (!res.ok) {
          if (!cancelled) setError(readApiError(body, "Pencarian gagal."));
          return;
        }
        if (!cancelled) setGroups((body.data?.groups as Group[]) || []);
      })
      .catch(() => {
        if (!cancelled) setError("Tidak dapat terhubung ke layanan pencarian.");
      });
    return () => {
      cancelled = true;
    };
  }, [q, sp, router]);

  function go(next: Record<string, string>) {
    const p = new URLSearchParams(sp.toString());
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    router.push(`/admin/search?${p.toString()}`);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    go({ q: input.trim(), page: "" });
  }

  const total = groups?.reduce((n, g) => n + g.items.length, 0) ?? 0;

  return (
    <Container>
      <form
        onSubmit={submit}
        role="search"
        className="mt-2 flex flex-col gap-3 sm:flex-row"
      >
        <label htmlFor="admin-search-q" className="sr-only">
          Kata kunci
        </label>
        <input
          id="admin-search-q"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={80}
          placeholder="Nama, email, nomor order, nomor tiket, atau ID"
          className="min-h-11 flex-1 rounded-2xl border border-stone-300 px-4 text-sm"
        />
        <button
          type="submit"
          className="min-h-11 rounded-2xl bg-gold-500 px-6 text-sm font-semibold text-white"
        >
          Cari
        </button>
      </form>

      <div
        className="mt-4 flex flex-wrap gap-2"
        role="group"
        aria-label="Jenis data"
      >
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={type === t.value}
            onClick={() =>
              go({ type: t.value === "all" ? "" : t.value, page: "" })
            }
            className={`min-h-11 rounded-full border px-4 text-sm ${type === t.value ? "border-gold-500 bg-gold-500 text-white" : "border-stone-300 text-ink/70"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6" aria-live="polite">
        {q.length < 2 ? (
          <p className="text-ink/65">
            Masukkan minimal 2 karakter untuk mencari lintas entitas.
          </p>
        ) : null}
        {error ? (
          <Alert tone="error" title="Gagal">
            {error}
          </Alert>
        ) : null}
        {q.length >= 2 && !error && groups === null ? (
          <LoadingState label="Mencari…" />
        ) : null}
        {groups && total === 0 ? (
          <p>Tidak ada hasil untuk &quot;{q}&quot;.</p>
        ) : null}
        {groups
          ?.filter((g) => g.items.length > 0)
          .map((g) => (
            <section
              key={g.type}
              className="mt-6"
              aria-labelledby={`grp-${g.type}`}
            >
              <div className="flex items-center justify-between">
                <h2 id={`grp-${g.type}`} className="text-lg font-semibold">
                  {g.label}
                </h2>
                {type === "all" && g.hasMore ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-gold-600 underline"
                    onClick={() => go({ type: g.type, page: "" })}
                  >
                    Lihat semua
                  </button>
                ) : null}
              </div>
              <ul className="mt-2 divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
                {g.items.map((it) => (
                  <li key={it.id}>
                    <Link
                      href={it.href}
                      className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {it.title}
                        </span>
                        <span className="block truncate text-sm text-ink/60">
                          {it.subtitle}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium">
                        {it.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {type !== "all" ? (
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => go({ page: String(page - 1) })}
                    className="min-h-11 rounded-2xl border px-4 text-sm disabled:opacity-40"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    disabled={!g.hasMore}
                    onClick={() => go({ page: String(page + 1) })}
                    className="min-h-11 rounded-2xl border px-4 text-sm disabled:opacity-40"
                  >
                    Berikutnya
                  </button>
                </div>
              ) : null}
            </section>
          ))}
      </div>
    </Container>
  );
}
