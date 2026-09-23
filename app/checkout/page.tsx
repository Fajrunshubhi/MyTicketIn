"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/shared/AppHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Input } from "@/components/ui/Input";
import { apiFetch, readApiError } from "@/lib/api";
import { formatRupiah } from "@/lib/format";

type Summary = {
  event: { id: string; title: string; slug: string; organizerProfileId: string };
  items: { ticketTypeId: string; name: string; quantity: number; unitPriceRupiah: number; lineTotalRupiah: number; seatLabel?: string }[];
  subtotalRupiah: number;
  requestedRedeemPoints: number;
  appliedRedeemPoints: number;
  loyaltyDiscountRupiah: number;
  totalPayableRupiah: number;
  availablePoints: number;
  maxRedeemablePoints: number;
  organizerName: string;
  reservationMinutes: number;
};

type Draft = {
  eventId: string;
  slug: string;
  organizerProfileId: string;
  inventoryMode: string;
  items: { ticketTypeId: string; quantity: number }[];
  seatIds: string[];
};

type Holder = { fullName: string; email: string; phone: string; identityNumber: string };

function emptyHolder(): Holder {
  return { fullName: "", email: "", phone: "", identityNumber: "" };
}

function validHolder(h: Holder) {
  const nik = h.identityNumber.trim();
  const phone = h.phone.replace(/\D/g, "");
  return h.fullName.trim().length >= 2 && h.email.includes("@") && phone.length >= 10 && /^\d{16}$/.test(nik);
}

export default function CheckoutPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [eventId, setEventId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [points, setPoints] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [holders, setHolders] = useState<Record<string, Holder[]>>({});
  const [seatHolders, setSeatHolders] = useState<Holder[]>([]);

  useEffect(() => {
    const raw = sessionStorage.getItem("mti_checkout");
    if (!raw) return;
    const parsed = JSON.parse(raw) as Draft;
    setDraft(parsed);
    setEventId(parsed.eventId);
    const next: Record<string, Holder[]> = {};
    for (const it of parsed.items || []) {
      next[it.ticketTypeId] = Array.from({ length: it.quantity }, () => emptyHolder());
    }
    setHolders(next);
    setSeatHolders(Array.from({ length: (parsed.seatIds || []).length }, () => emptyHolder()));
  }, []);

  useEffect(() => {
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          return;
        }
        const body = (await res.json()) as { data?: { access?: { canBuy?: boolean; canOrganize?: boolean } } };
        if (body.data && body.data.access?.canBuy === false) {
          sessionStorage.removeItem("mti_checkout");
          router.replace("/dashboard");
        }
      })
      .catch(() => undefined);
  }, [router]);

  useEffect(() => {
    if (!draft || !eventId) return;
    let cancelled = false;
    (async () => {
      const res = await apiFetch("/api/checkout/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          items: draft.items,
          seatIds: draft.seatIds,
          redeemPoints: points,
        }),
      });
      const body = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        if (res.status === 401) {
          router.replace(`/login?portal=buyer&callbackUrl=/checkout`);
          return;
        }
        setError(readApiError(body, "Ringkasan checkout gagal."));
        setSummary(null);
        return;
      }
      setError("");
      setSummary(body.data as Summary);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft, eventId, points, router]);

  const slots = useMemo(() => {
    if (!draft) return [];
    if ((draft.seatIds || []).length > 0) {
      return draft.seatIds.map((id, i) => ({
        key: `seat-${id}`,
        title: `Tiket kursi ${i + 1}`,
        holder: seatHolders[i] || emptyHolder(),
        set: (h: Holder) => setSeatHolders((cur) => {
          const next = cur.slice();
          next[i] = h;
          return next;
        }),
      }));
    }
    const out: { key: string; title: string; holder: Holder; set: (h: Holder) => void }[] = [];
    for (const it of draft.items) {
      const name = summary?.items.find((s) => s.ticketTypeId === it.ticketTypeId)?.name || "Tiket";
      const list = holders[it.ticketTypeId] || [];
      list.forEach((h, i) => {
        out.push({
          key: `${it.ticketTypeId}-${i}`,
          title: `${name} · pemegang ${i + 1}`,
          holder: h,
          set: (next) => setHolders((cur) => {
            const copy = [...(cur[it.ticketTypeId] || [])];
            copy[i] = next;
            return { ...cur, [it.ticketTypeId]: copy };
          }),
        });
      });
    }
    return out;
  }, [draft, holders, seatHolders, summary]);

  const holdersReady = useMemo(() => {
    if (slots.length === 0) return false;
    const niks = new Set<string>();
    for (const s of slots) {
      if (!validHolder(s.holder)) return false;
      const nik = s.holder.identityNumber.trim();
      if (niks.has(nik)) return false;
      niks.add(nik);
    }
    return true;
  }, [slots]);

  async function confirm() {
    if (!draft || !eventId || !holdersReady) return;
    setBusy(true);
    setError("");
    const key = crypto.randomUUID().replace(/-/g, "");
    const payload =
      (draft.seatIds || []).length > 0
        ? { attendees: seatHolders }
        : {
            items: draft.items.map((it) => ({
              ticketTypeId: it.ticketTypeId,
              quantity: it.quantity,
              attendees: holders[it.ticketTypeId] || [],
            })),
          };
    const res = await apiFetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({
        eventId,
        items: payload.items || draft.items,
        seatIds: draft.seatIds,
        attendees: payload.attendees,
        redeemPoints: points,
        confirmed: true,
      }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Order gagal dibuat."));
      return;
    }
    const id = (body.data as { order?: { id: string } })?.order?.id;
    sessionStorage.removeItem("mti_checkout");
    if (id) router.push(`/orders/${id}`);
  }

  return (
    <main id="konten-utama" className="auth-shell min-h-screen">
      <AppHeader items={[{ href: "/events", label: "Katalog" }]} />
      <Container>
        <h1 className="font-display text-3xl text-ink">Konfirmasi checkout</h1>
        <p className="mt-2 text-ink/65">
          Isi biodata pemegang untuk setiap tiket. Akun Anda hanya pembeli; data tiket tidak boleh sama (NIK unik). Reservasi 15 menit setelah order dibuat.
        </p>
        {error ? <div className="mt-4"><Alert tone="error" title={error} /></div> : null}
        {!draft ? <p className="mt-6 text-ink/70">Tidak ada pilihan tiket. Pilih tiket dari halaman event.</p> : null}
        {summary ? (
          <section className="mt-6 space-y-4 rounded-2xl border border-stone-200 p-6">
            <h2 className="font-display text-2xl text-ink">{summary.event?.title || "Checkout"}</h2>
            <ul className="space-y-2">
              {summary.items.map((it) => (
                <li key={`${it.ticketTypeId}-${it.seatLabel || ""}`} className="text-ink/80">
                  {it.name} {it.seatLabel ? `· ${it.seatLabel}` : ""} × {it.quantity} — {formatRupiah(it.lineTotalRupiah)}
                </li>
              ))}
            </ul>
            <p>Subtotal {formatRupiah(summary.subtotalRupiah)}</p>
            <Input
              label={`Tukar poin (tersedia ${summary.availablePoints}, maks ${summary.maxRedeemablePoints})`}
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value) || 0)}
            />
            <p className="text-sm text-ink/55">
              Poin {summary.organizerName || "organizer ini"} adalah manfaat loyalty sandbox dan tidak dapat diuangkan. Diskon maksimum 20% subtotal, 1 poin = Rp10.
            </p>
            <p>Diskon poin {formatRupiah(summary.loyaltyDiscountRupiah)}</p>
            <p className="text-lg font-semibold text-ink">Total dibayar {formatRupiah(summary.totalPayableRupiah)}</p>
            <div className="space-y-4 border-t border-stone-200 pt-4">
              <h3 className="font-display text-xl text-ink">Biodata pemegang tiket</h3>
              {slots.map((slot) => (
                <fieldset key={slot.key} className="space-y-3 rounded-xl border border-stone-200 p-4">
                  <legend className="px-1 text-sm font-semibold text-ink">{slot.title}</legend>
                  <Input label="Nama lengkap" name={`${slot.key}-name`} autoComplete="name" value={slot.holder.fullName} onChange={(e) => slot.set({ ...slot.holder, fullName: e.target.value })} />
                  <Input label="Email" name={`${slot.key}-email`} type="email" autoComplete="email" value={slot.holder.email} onChange={(e) => slot.set({ ...slot.holder, email: e.target.value })} />
                  <Input label="Nomor HP" name={`${slot.key}-phone`} type="tel" autoComplete="tel" inputMode="numeric" value={slot.holder.phone} onChange={(e) => slot.set({ ...slot.holder, phone: e.target.value })} />
                  <Input label="NIK (16 digit)" name={`${slot.key}-nik`} inputMode="numeric" maxLength={16} value={slot.holder.identityNumber} onChange={(e) => slot.set({ ...slot.holder, identityNumber: e.target.value.replace(/\D/g, "").slice(0, 16) })} />
                </fieldset>
              ))}
            </div>
            <Button disabled={busy || !holdersReady} onClick={confirm}>
              {busy ? "Memproses…" : "Konfirmasi order"}
            </Button>
          </section>
        ) : null}
      </Container>
    </main>
  );
}
