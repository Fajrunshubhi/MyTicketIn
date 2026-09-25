"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import LogoutButton from "@/components/LogoutButton";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch, readApiError } from "@/lib/api";
import { type AccountProfile } from "@/lib/account";
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

function holderFromProfile(me: AccountProfile): Holder {
  return {
    fullName: me.name || me.username || "",
    email: me.email || "",
    phone: "",
    identityNumber: "",
  };
}

function applyBuyerFields(existing: Holder | undefined, buyer: Holder): Holder {
  return {
    fullName: buyer.fullName,
    email: buyer.email,
    phone: existing?.phone || "",
    identityNumber: existing?.identityNumber || "",
  };
}

function validHolder(h: Holder) {
  const nik = h.identityNumber.trim();
  const phone = h.phone.replace(/\D/g, "");
  return h.fullName.trim().length >= 2 && h.email.includes("@") && phone.length >= 10 && /^\d{16}$/.test(nik);
}

function ticketCount(d: Draft) {
  if ((d.seatIds || []).length > 0) return d.seatIds.length;
  return d.items.reduce((n, it) => n + it.quantity, 0);
}

function firstSlotKey(d: Draft) {
  if ((d.seatIds || []).length > 0) return `seat-${d.seatIds[0]}`;
  const it = d.items.find((row) => row.quantity > 0);
  return it ? `${it.ticketTypeId}-0` : "";
}

export function CheckoutClient({ slug }: { slug: string }) {
  const router = useRouter();
  const eventHref = `/events/${slug}`;
  const checkoutHref = `/events/${slug}/checkout`;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [eventId, setEventId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [points, setPoints] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [holders, setHolders] = useState<Record<string, Holder[]>>({});
  const [seatHolders, setSeatHolders] = useState<Holder[]>([]);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [selfSlotKey, setSelfSlotKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("mti_checkout");
    if (!raw) {
      setReady(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Draft;
      if (!parsed.slug || parsed.slug !== slug) {
        setReady(true);
        return;
      }
      setDraft(parsed);
      setEventId(parsed.eventId);
      const next: Record<string, Holder[]> = {};
      for (const it of parsed.items || []) {
        next[it.ticketTypeId] = Array.from({ length: it.quantity }, () => emptyHolder());
      }
      setHolders(next);
      setSeatHolders(Array.from({ length: (parsed.seatIds || []).length }, () => emptyHolder()));
    } catch {
      sessionStorage.removeItem("mti_checkout");
    }
    setReady(true);
  }, [slug]);

  useEffect(() => {
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          return;
        }
        const body = (await res.json()) as { data?: AccountProfile };
        if (body.data && body.data.access?.canBuy === false) {
          sessionStorage.removeItem("mti_checkout");
          router.replace("/dashboard");
          return;
        }
        if (body.data) setProfile(body.data);
      })
      .catch(() => undefined);
  }, [router]);

  function writeHolder(key: string, next: Holder) {
    if (!draft) return;
    if (key.startsWith("seat-")) {
      const seatId = key.slice("seat-".length);
      const idx = (draft.seatIds || []).indexOf(seatId);
      if (idx < 0) return;
      setSeatHolders((cur) => {
        const copy = cur.slice();
        copy[idx] = next;
        return copy;
      });
      return;
    }
    const dash = key.lastIndexOf("-");
    const ticketTypeId = key.slice(0, dash);
    const idx = Number(key.slice(dash + 1));
    if (!Number.isInteger(idx) || idx < 0) return;
    setHolders((cur) => {
      const copy = [...(cur[ticketTypeId] || [])];
      copy[idx] = next;
      return { ...cur, [ticketTypeId]: copy };
    });
  }

  function assignSelf(key: string) {
    if (!profile || !draft) return;
    const buyer = holderFromProfile(profile);
    if (selfSlotKey && selfSlotKey !== key) {
      writeHolder(selfSlotKey, emptyHolder());
    }
    writeHolder(key, applyBuyerFields(undefined, buyer));
    setSelfSlotKey(key);
  }

  function clearSelf(key: string) {
    writeHolder(key, emptyHolder());
    setSelfSlotKey((cur) => (cur === key ? null : cur));
  }

  useEffect(() => {
    if (!profile || !draft || selfSlotKey) return;
    if (ticketCount(draft) !== 1) return;
    const key = firstSlotKey(draft);
    if (!key) return;
    const buyer = holderFromProfile(profile);
    writeHolder(key, applyBuyerFields(undefined, buyer));
    setSelfSlotKey(key);
  }, [profile, draft, selfSlotKey]);

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
          router.replace(`/login?portal=buyer&callbackUrl=${encodeURIComponent(checkoutHref)}`);
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
  }, [checkoutHref, draft, eventId, points, router]);

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
    <div className="min-h-screen bg-[#f7f5fc]">
      <header className="fixed inset-x-0 top-0 z-50 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <BrandMark compact href="/" />
          <p className="hidden min-w-0 truncate text-sm font-medium text-ink/70 sm:block">
            {summary?.event?.title || "Checkout tiket"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={eventHref}
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-gold-800 hover:underline"
            >
              Kembali ke event
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="h-[4.25rem]" aria-hidden="true" />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <ol className="mb-6 flex flex-wrap gap-2 text-xs font-medium sm:text-sm" aria-label="Langkah checkout">
          <li>
            <Link href={eventHref} className="rounded-full bg-white px-3 py-1.5 text-ink/55">
              1. Pilih tiket
            </Link>
          </li>
          <li>
            <span className="rounded-full bg-gold-500 px-3 py-1.5 text-white">2. Data pemegang</span>
          </li>
          <li>
            <span className="rounded-full bg-white px-3 py-1.5 text-ink/45">3. Pembayaran</span>
          </li>
        </ol>

        <h1 className="font-display text-3xl text-ink">Checkout</h1>
        <p className="mt-2 max-w-2xl text-ink/65">
          {slots.length <= 1
            ? "Biodata nama dan email diisi dari akun Anda. Lengkapi nomor HP dan NIK. Reservasi 15 menit setelah order dibuat."
            : "Centang satu tiket jika Anda sendiri pemegangnya. Tiket lain diisi untuk orang berbeda. NIK setiap tiket harus unik. Reservasi 15 menit setelah order dibuat."}
        </p>
        {error ? (
          <div className="mt-4">
            <Alert tone="error" title={error} />
          </div>
        ) : null}

        {ready && !draft ? (
          <p className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 text-ink/70">
            Tidak ada pilihan tiket untuk checkout ini.{" "}
            <Link href={eventHref} className="font-medium text-gold-800 underline">
              Kembali ke halaman event
            </Link>{" "}
            dan pilih tiket.
          </p>
        ) : null}

        {summary ? (
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
            <div className="space-y-4">
              <h2 className="font-display text-xl text-ink">Biodata pemegang tiket</h2>
              {slots.map((slot) => {
                const isSelf = selfSlotKey === slot.key;
                const selfTaken = Boolean(selfSlotKey && selfSlotKey !== slot.key);
                return (
                  <fieldset key={slot.key} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
                    <legend className="px-1 text-sm font-semibold text-ink">{slot.title}</legend>
                    {slots.length > 1 && profile ? (
                      <label className={`flex min-h-11 items-start gap-2 text-sm ${selfTaken ? "text-ink/45" : "text-ink/80"}`}>
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-gold-600"
                          checked={isSelf}
                          disabled={selfTaken}
                          onChange={(e) => {
                            if (e.target.checked) assignSelf(slot.key);
                            else clearSelf(slot.key);
                          }}
                        />
                        <span>Gunakan data akun saya sebagai pemegang tiket ini{selfTaken ? " (sudah dipakai di tiket lain)" : ""}</span>
                      </label>
                    ) : null}
                    <Input
                      label="Nama lengkap"
                      name={`${slot.key}-name`}
                      autoComplete="name"
                      readOnly={isSelf}
                      className={isSelf ? "bg-stone-50" : ""}
                      value={slot.holder.fullName}
                      onChange={(e) => slot.set({ ...slot.holder, fullName: e.target.value })}
                    />
                    <Input
                      label="Email"
                      name={`${slot.key}-email`}
                      type="email"
                      autoComplete="email"
                      readOnly={isSelf}
                      className={isSelf ? "bg-stone-50" : ""}
                      value={slot.holder.email}
                      onChange={(e) => slot.set({ ...slot.holder, email: e.target.value })}
                    />
                    <Input
                      label="Nomor HP"
                      name={`${slot.key}-phone`}
                      type="tel"
                      autoComplete="tel"
                      inputMode="numeric"
                      value={slot.holder.phone}
                      onChange={(e) => slot.set({ ...slot.holder, phone: e.target.value })}
                    />
                    <Input
                      label="NIK (16 digit)"
                      name={`${slot.key}-nik`}
                      inputMode="numeric"
                      maxLength={16}
                      value={slot.holder.identityNumber}
                      onChange={(e) => slot.set({ ...slot.holder, identityNumber: e.target.value.replace(/\D/g, "").slice(0, 16) })}
                    />
                  </fieldset>
                );
              })}
            </div>

            <aside className="rounded-3xl border border-stone-200 bg-white p-5 shadow-card lg:sticky lg:top-24">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Ringkasan pesanan</p>
              <h2 className="mt-2 font-display text-xl text-ink">{summary.event?.title || "Checkout"}</h2>
              <ul className="mt-4 space-y-2 border-b border-stone-100 pb-4">
                {summary.items.map((it) => (
                  <li key={`${it.ticketTypeId}-${it.seatLabel || ""}`} className="flex justify-between gap-3 text-sm text-ink/80">
                    <span>
                      {it.name} {it.seatLabel ? `· ${it.seatLabel}` : ""} × {it.quantity}
                    </span>
                    <span className="shrink-0 font-medium">{formatRupiah(it.lineTotalRupiah)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex justify-between text-sm">
                <span>Subtotal</span>
                <span>{formatRupiah(summary.subtotalRupiah)}</span>
              </p>
              <div className="mt-3">
                <Input
                  label={`Tukar poin (tersedia ${summary.availablePoints}, maks ${summary.maxRedeemablePoints})`}
                  type="number"
                  min={0}
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value) || 0)}
                />
              </div>
              <p className="mt-2 text-xs text-ink/55">
                Poin {summary.organizerName || "organizer ini"} adalah manfaat loyalty sandbox dan tidak dapat diuangkan. Diskon maksimum 20% subtotal, 1 poin = Rp10.
              </p>
              <p className="mt-3 flex justify-between text-sm">
                <span>Diskon poin</span>
                <span>{formatRupiah(summary.loyaltyDiscountRupiah)}</span>
              </p>
              <p className="mt-4 flex justify-between text-lg font-semibold text-ink">
                <span>Total</span>
                <span>{formatRupiah(summary.totalPayableRupiah)}</span>
              </p>
              <p className="mt-2 text-xs text-ink/50">Hold 15 menit setelah order dikonfirmasi.</p>
              <Button className="mt-4 w-full" disabled={busy || !holdersReady} onClick={confirm}>
                {busy ? "Memproses…" : "Konfirmasi order"}
              </Button>
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  );
}
