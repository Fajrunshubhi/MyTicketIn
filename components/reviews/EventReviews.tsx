"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, readApiError } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EventRatingSummary, initials, StarRating } from "@/components/reviews/StarRating";
import type { EventReview } from "@/lib/server/reviews";
import { emptyRatingSummary, type RatingSummary } from "@/lib/reviews-format";

export function EventReviews({
  slug,
  eventTitle,
  organizerName,
}: {
  slug: string;
  eventTitle: string;
  organizerName: string;
}) {
  const [items, setItems] = useState<EventReview[]>([]);
  const [summary, setSummary] = useState<RatingSummary>(emptyRatingSummary());
  const [canReview, setCanReview] = useState(false);
  const [mine, setMine] = useState<EventReview | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/events/${encodeURIComponent(slug)}/reviews`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return;
        const data = (body.data || {}) as {
          items?: EventReview[];
          canReview?: boolean;
          mine?: EventReview | null;
          summary?: RatingSummary;
        };
        setItems(data.items || []);
        setSummary(data.summary || emptyRatingSummary());
        setCanReview(Boolean(data.canReview));
        setMine(data.mine || null);
        if (data.mine) {
          setRating(data.mine.rating);
          setComment(data.mine.comment);
        }
      })
      .catch(() => undefined);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(`/api/events/${encodeURIComponent(slug)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(readApiError(body, "Ulasan gagal dikirim."));
        return;
      }
      setNotice("Ulasan tersimpan.");
      load();
    } catch {
      setError("Ulasan gagal dikirim.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-stone-200 pt-10" aria-labelledby="event-reviews-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="event-reviews-heading" className="text-xl font-semibold text-ink">
            Ulasan pengunjung
          </h2>
          <p className="mt-1 text-sm text-ink/65">
            Rating dan komentar untuk {eventTitle}
            {organizerName ? ` · penyelenggara ${organizerName}` : ""}.
          </p>
        </div>
        <EventRatingSummary className="shrink-0" average={summary.average} count={summary.count} />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        {canReview ? (
          <form
            className="rounded-2xl border border-stone-200 bg-white p-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              void submit();
            }}
          >
            <p className="text-sm font-medium text-ink">{mine ? "Perbarui ulasan Anda" : "Tulis ulasan"}</p>
            <fieldset className="mt-3">
              <legend className="text-sm text-ink/70">Rating</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`min-h-11 rounded-full px-3 text-sm ${n <= rating ? "bg-gold-500 text-white" : "border border-stone-300 bg-white text-ink"}`}
                    aria-pressed={n === rating}
                    aria-label={`${n} bintang`}
                    onClick={() => setRating(n)}
                  >
                    {n} ★
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="mt-4 block text-sm font-medium text-ink" htmlFor="review-comment">
              Komentar
            </label>
            <textarea
              id="review-comment"
              className="mt-1 min-h-[6rem] w-full rounded-xl border border-stone-300 p-3 text-sm text-ink"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              required
            />
            {error ? <div className="mt-3"><Alert tone="error" title={error} /></div> : null}
            {notice ? <div className="mt-3"><Alert tone="success" title={notice} /></div> : null}
            <div className="mt-4">
              <Button type="submit" loading={busy} disabled={busy}>
                {mine ? "Simpan perubahan" : "Kirim ulasan"}
              </Button>
            </div>
          </form>
        ) : (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-4 text-sm text-ink/65">
            Ulasan hanya untuk pembeli tiket event ini.{" "}
            <Link className="text-gold-700 underline" href={`/login?next=/events/${slug}`}>
              Masuk
            </Link>{" "}
            jika Anda sudah membeli tiket.
          </p>
        )}

        {items.length === 0 ? (
          <p className="rounded-2xl border border-stone-100 bg-white p-4 text-sm text-ink/65">Belum ada ulasan untuk event ini.</p>
        ) : (
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={item.id} className="rounded-2xl border border-stone-100 bg-white p-4">
                <StarRating value={item.rating} />
                <p className="mt-2 text-sm text-ink/80">“{item.comment}”</p>
                <p className="mt-3 flex items-center gap-2 text-xs text-ink/60">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eee8ff] text-[11px] font-semibold text-gold-800">
                    {initials(item.authorName)}
                  </span>
                  {item.authorName} · {item.eventTitle} · {item.organizerName}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
