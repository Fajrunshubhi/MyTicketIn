"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/shared/AppHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { apiFetch, readApiError } from "@/lib/api";
import { formatRupiah } from "@/lib/format";

type Promo = {
  id: string;
  code: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  maxDiscountRupiah: number | null;
  minSubtotalRupiah: number;
  startsAt: string;
  endsAt: string;
  maxRedemptions: number | null;
  redeemedCount: number;
  status: "ACTIVE" | "DISABLED";
  state: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "DISABLED" | "EXHAUSTED";
};

const STATE_LABEL: Record<Promo["state"], string> = {
  ACTIVE: "Aktif",
  SCHEDULED: "Belum mulai",
  EXPIRED: "Kedaluwarsa",
  DISABLED: "Dinonaktifkan",
  EXHAUSTED: "Kuota habis",
};

// The form uses WIB (UTC+7); the server stores UTC.
const wibToIso = (local: string) => new Date(`${local}:00+07:00`).toISOString();
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }) + " WIB";

export default function EventPromoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const embedded = pathname.startsWith("/dashboard");
  const eventHref = `/dashboard/event/${params.id}`;
  const [items, setItems] = useState<Promo[]>([]);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<"PERCENT" | "FIXED">("PERCENT");

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/organizer/events/${params.id}/promo-codes`);
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`${eventHref}/promo`)}&portal=organizer`);
      return;
    }
    if (!res.ok) {
      setError(readApiError(body, "Gagal memuat kode promo."));
      return;
    }
    setItems((body.data?.items || []) as Promo[]);
  }, [params.id, router, eventHref]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError("");
    setFieldErrors({});
    setBusy(true);
    const res = await apiFetch(`/api/organizer/events/${params.id}/promo-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: String(fd.get("code") || ""),
        discountType: type,
        discountValue: Number(fd.get("discountValue") || 0),
        maxDiscountRupiah: type === "PERCENT" ? String(fd.get("maxDiscountRupiah") || "") || undefined : undefined,
        minSubtotalRupiah: String(fd.get("minSubtotalRupiah") || "") || undefined,
        maxRedemptions: String(fd.get("maxRedemptions") || "") || undefined,
        startsAt: wibToIso(String(fd.get("startsAt") || "")),
        endsAt: wibToIso(String(fd.get("endsAt") || "")),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Kode promo gagal dibuat."));
      setFieldErrors((body?.error?.fieldErrors || {}) as Record<string, string>);
      return;
    }
    form.reset();
    await load();
  }

  async function toggle(p: Promo) {
    setBusy(true);
    setError("");
    const res = await apiFetch(`/api/organizer/events/${params.id}/promo-codes/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: p.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Perubahan gagal."));
      return;
    }
    await load();
  }

  const inner = (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-ink">Kode promo</h1>
        <p className="mt-2 text-sm text-ink/65">
          Buat kode potongan harga untuk event ini. Pembeli memasukkannya saat checkout. Satu pembeli dapat memakai satu kode
          sekali per pembelian, potongan maksimum 90% dari subtotal, dan kode tidak bisa diubah nilainya setelah dibuat
          (Anda tetap dapat menonaktifkannya).
        </p>
      </div>
      {error ? <Alert tone="error" title="Gagal">{error}</Alert> : null}

      <form onSubmit={create}>
        <FormSection title="Kode baru" description="Waktu berlaku memakai WIB.">
          <Input
            label="Kode"
            name="code"
            required
            minLength={3}
            maxLength={32}
            autoComplete="off"
            hint="3–32 karakter: huruf, angka, _ atau -. Huruf besar/kecil dianggap sama."
            error={fieldErrors.code}
          />
          <Select
            label="Jenis potongan"
            name="discountType"
            value={type}
            onChange={(e) => setType(e.target.value === "FIXED" ? "FIXED" : "PERCENT")}
          >
            <option value="PERCENT">Persen (1–90%)</option>
            <option value="FIXED">Nominal tetap (Rp)</option>
          </Select>
          <Input
            label={type === "PERCENT" ? "Persentase potongan" : "Nominal potongan (Rp)"}
            name="discountValue"
            type="number"
            min={1}
            max={type === "PERCENT" ? 90 : undefined}
            required
            error={fieldErrors.discountValue}
          />
          {type === "PERCENT" ? (
            <Input
              label="Batas potongan (Rp, opsional)"
              name="maxDiscountRupiah"
              type="number"
              min={1}
              error={fieldErrors.maxDiscountRupiah}
            />
          ) : null}
          <Input
            label="Minimal pembelian (Rp, opsional)"
            name="minSubtotalRupiah"
            type="number"
            min={0}
            error={fieldErrors.minSubtotalRupiah}
          />
          <Input
            label="Kuota pemakaian (opsional)"
            name="maxRedemptions"
            type="number"
            min={1}
            hint="Kosongkan bila tidak dibatasi."
            error={fieldErrors.maxRedemptions}
          />
          <Input label="Mulai berlaku (WIB)" name="startsAt" type="datetime-local" required error={fieldErrors.startsAt} />
          <Input label="Berakhir (WIB)" name="endsAt" type="datetime-local" required error={fieldErrors.endsAt} />
          <div className="flex items-end">
            <Button type="submit" loading={busy}>
              Buat kode
            </Button>
          </div>
        </FormSection>
      </form>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-ink">Daftar kode</h2>
        <ul className="mt-4 space-y-2">
          {items.length === 0 ? <li className="text-sm text-ink/60">Belum ada kode promo.</li> : null}
          {items.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 p-3">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-ink">
                  {p.code} · {STATE_LABEL[p.state]}
                </p>
                <p className="text-ink/70">
                  {p.discountType === "PERCENT"
                    ? `${p.discountValue}%${p.maxDiscountRupiah ? ` (maks ${formatRupiah(p.maxDiscountRupiah)})` : ""}`
                    : formatRupiah(p.discountValue)}
                  {p.minSubtotalRupiah > 0 ? ` · min. ${formatRupiah(p.minSubtotalRupiah)}` : ""} · terpakai {p.redeemedCount}
                  {p.maxRedemptions ? ` dari ${p.maxRedemptions}` : ""}
                </p>
                <p className="text-ink/55">
                  {fmt(p.startsAt)} – {fmt(p.endsAt)}
                </p>
              </div>
              <Button type="button" variant="secondary" loading={busy} onClick={() => void toggle(p)}>
                {p.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  if (embedded) {
    return <div>{inner}</div>;
  }

  return (
    <main id="main-content" className="auth-shell min-h-screen">
      <AppHeader homeHref="/dashboard" items={[{ href: eventHref, label: "Kembali ke event" }]} />
      <Container>{inner}</Container>
    </main>
  );
}
