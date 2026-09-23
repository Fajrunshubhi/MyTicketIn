import { AppError, query } from "@/lib/server/http";
import { publicImageSrc } from "@/lib/server/gallery";

export type PublicImage = { url: string; alt: string };
export type CatalogCard = {
  slug: string;
  title: string;
  category: string;
  city: string;
  startsAt: string;
  timezone: string;
  image: PublicImage;
  priceFromRupiah: number | null;
  saleStatus: string;
};

type EventRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  venue_name: string;
  address_line: string;
  city: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  tags: string[] | null;
  timezone: string;
  starts_at: string;
  ends_at: string;
  terms: string;
  contact_email: string;
  contact_phone: string | null;
  status: string;
  inventory_mode: string;
  organizer_profile_id: string;
};

type TicketRow = {
  id: string;
  name: string;
  description: string | null;
  price_rupiah: string | number;
  quota: number;
  max_per_account: number;
  sale_starts_at: string;
  sale_ends_at: string;
  reserved_quantity: number;
  paid_quantity: number;
  sales_stopped_at: string | null;
};

export function dummyCover(category: string, title: string): string {
  const blob = `${category} ${title}`.toLowerCase();
  if (blob.includes("film") || blob.includes("teater") || blob.includes("pameran") || blob.includes("seni")) {
    return "/dummy-events/theater-1.jpg";
  }
  if (blob.includes("lari") || blob.includes("run") || blob.includes("olahraga")) return "/dummy-events/run-jakarta.jpg";
  if (blob.includes("kuliner") || blob.includes("food") || blob.includes("festival")) return "/dummy-events/food-1.jpg";
  if (blob.includes("seminar") || blob.includes("summit") || blob.includes("konferensi")) return "/dummy-events/summit-1.jpg";
  return "/dummy-events/jazz-1.jpg";
}

async function galleryUrls(eventId: string): Promise<string[]> {
  const rows = await query<{ image_url: string }>(
    `SELECT image_url FROM event_gallery_images WHERE event_id = $1 ORDER BY sort_order, id`,
    [eventId],
  );
  return rows.map((r) => publicImageSrc(r.image_url, "")).filter(Boolean);
}

function cover(title: string, category: string, urls: string[]): PublicImage {
  const first = urls.find((u) => u.trim());
  if (first) return { url: first, alt: title };
  return { url: dummyCover(category, title), alt: title };
}

function ticketSaleStatus(eventStatus: string, startsAt: Date, ticket: TicketRow, now: Date): string {
  if (eventStatus !== "PUBLISHED" || ticket.sales_stopped_at) return "STOPPED";
  const saleStart = new Date(ticket.sale_starts_at);
  const saleEnd = new Date(ticket.sale_ends_at);
  if (now < saleStart) return "NOT_STARTED";
  if (!(now < saleEnd) || !(now < startsAt)) return "ENDED";
  return "AVAILABLE";
}

function listSaleStatus(eventStatus: string, startsAt: Date, tickets: TicketRow[], now: Date): string {
  let hasAvail = false;
  let hasNotStarted = false;
  for (const t of tickets) {
    const st = ticketSaleStatus(eventStatus, startsAt, t, now);
    if (st === "AVAILABLE") hasAvail = true;
    if (st === "NOT_STARTED") hasNotStarted = true;
  }
  if (hasAvail) return "AVAILABLE";
  if (hasNotStarted) return "NOT_STARTED";
  if (tickets.length === 0) return "STOPPED";
  return "ENDED";
}

function priceFrom(eventStatus: string, startsAt: Date, tickets: TicketRow[], now: Date): number | null {
  let eligible: number | null = null;
  let all: number | null = null;
  for (const t of tickets) {
    const p = Number(t.price_rupiah);
    if (all === null || p < all) all = p;
    if (ticketSaleStatus(eventStatus, startsAt, t, now) === "AVAILABLE") {
      if (eligible === null || p < eligible) eligible = p;
    }
  }
  return eligible ?? all;
}

export async function listCatalog(params: {
  q: string;
  category: string;
  city: string;
  province: string;
  tag: string;
  limit: number;
}): Promise<{ items: CatalogCard[]; nextCursor: string | null; appliedFilters: Record<string, string> }> {
  const limit = Math.min(Math.max(params.limit || 12, 1), 24);
  const q = params.q.trim();
  const category = params.category.trim().toLowerCase();
  const city = params.city.trim().toLowerCase();
  const province = params.province.trim().toLowerCase();
  const tag = params.tag.trim().toLowerCase();
  const rows = await query<EventRow>(
    `SELECT e.id, e.organizer_profile_id, e.slug, e.title, e.description, e.category, e.venue_name, e.address_line,
            e.city, e.province, e.latitude, e.longitude, e.tags, e.timezone, e.starts_at::text, e.ends_at::text,
            e.terms, e.contact_email, e.contact_phone, e.status::text AS status, e.inventory_mode::text AS inventory_mode
     FROM events e
     WHERE e.status = 'PUBLISHED'
       AND e.starts_at > NOW()
       AND ($1 = '' OR e.search_document @@ plainto_tsquery('simple', $1)
            OR e.title ILIKE '%' || $1 || '%'
            OR EXISTS (SELECT 1 FROM event_tags et WHERE et.event_id = e.id AND et.tag = ANY (regexp_split_to_array(lower($1), '\\s+'))))
       AND ($2 = '' OR lower(e.category) = $2)
       AND ($3 = '' OR lower(e.city) = $3)
       AND ($4 = '' OR lower(e.province) = $4)
       AND ($5 = '' OR $5 = ANY (e.tags))
     ORDER BY e.starts_at ASC, e.id ASC
     LIMIT $6`,
    [q, category, city, province, tag, limit + 1],
  );
  const page = rows.slice(0, limit);
  const items: CatalogCard[] = [];
  const now = new Date();
  for (const e of page) {
    const tickets = await query<TicketRow>(
      `SELECT id, name, description, price_rupiah, quota, max_per_account, sale_starts_at::text, sale_ends_at::text,
              reserved_quantity, paid_quantity, sales_stopped_at::text
       FROM event_ticket_types WHERE event_id = $1 ORDER BY sort_order, id`,
      [e.id],
    );
    const urls = await galleryUrls(e.id);
    const starts = new Date(e.starts_at);
    items.push({
      slug: e.slug,
      title: e.title,
      category: e.category,
      city: e.city,
      startsAt: starts.toISOString(),
      timezone: e.timezone,
      image: cover(e.title, e.category, urls),
      priceFromRupiah: priceFrom(e.status, starts, tickets, now),
      saleStatus: listSaleStatus(e.status, starts, tickets, now),
    });
  }
  const applied: Record<string, string> = { sort: "soonest" };
  if (q) applied.q = q;
  if (category) applied.category = category;
  if (city) applied.city = city;
  if (province) applied.province = province;
  if (tag) applied.tag = tag;
  const last = page[page.length - 1];
  return {
    items,
    nextCursor: rows.length > limit && last ? Buffer.from(`${last.starts_at}|${last.id}`).toString("base64url") : null,
    appliedFilters: applied,
  };
}

export function parseNaturalFilter(raw: string) {
  const s = raw.trim().replace(/\s+/g, " ");
  const n = [...s].length;
  if (n < 2 || n > 300) {
    throw new AppError("CATALOG_NATURAL_QUERY_INVALID", "Teks pencarian alami tidak valid.", {}, 400);
  }
  const q = [...s].slice(0, 100).join("");
  const filterDto = { q, sort: "soonest" };
  return {
    mode: "BASIC_SEARCH_FALLBACK",
    filterDto,
    chips: [{ key: "q", label: "Kata kunci", value: q }],
    canonicalQuery: `q=${encodeURIComponent(q)}`,
    notice: "Filter AI tidak tersedia; pencarian kata kunci digunakan.",
  };
}

export async function listFilters() {
  const nowClause = `status = 'PUBLISHED' AND starts_at > NOW()`;
  const cats = await query<{ category: string }>(
    `SELECT category FROM events WHERE ${nowClause} GROUP BY category ORDER BY lower(category) LIMIT 200`,
  );
  const locs = await query<{ city: string; province: string }>(
    `SELECT city, province FROM events WHERE ${nowClause} GROUP BY city, province ORDER BY lower(city), lower(province) LIMIT 200`,
  );
  const tags = await query<{ t: string }>(
    `SELECT t FROM (
       SELECT DISTINCT unnest(tags) AS t FROM events WHERE ${nowClause} AND cardinality(tags) > 0
     ) x ORDER BY t LIMIT 200`,
  );
  return {
    categories: cats.map((c) => c.category),
    locations: locs.map((l) => ({ city: l.city, province: l.province })),
    tags: tags.map((t) => t.t),
  };
}

export async function getPublicEvent(slug: string) {
  const key = slug.trim().toLowerCase();
  if (!key) return null;
  const rows = await query<EventRow>(
    `SELECT e.id, e.organizer_profile_id, e.slug, e.title, e.description, e.category, e.venue_name, e.address_line,
            e.city, e.province, e.latitude, e.longitude, e.tags, e.timezone, e.starts_at::text, e.ends_at::text,
            e.terms, e.contact_email, e.contact_phone, e.status::text AS status, e.inventory_mode::text AS inventory_mode
     FROM events e WHERE e.slug = $1 LIMIT 1`,
    [key],
  );
  const e = rows[0];
  if (!e || e.status !== "PUBLISHED" || !(new Date(e.ends_at) > new Date())) return null;
  const tickets = await query<TicketRow>(
    `SELECT id, name, description, price_rupiah, quota, max_per_account, sale_starts_at::text, sale_ends_at::text,
            reserved_quantity, paid_quantity, sales_stopped_at::text
     FROM event_ticket_types WHERE event_id = $1 ORDER BY sort_order, id`,
    [e.id],
  );
  const sections = await query<{ id: string; name: string; ticket_type_id: string }>(
    `SELECT id, name, ticket_type_id FROM venue_sections WHERE event_id = $1 ORDER BY sort_order, id`,
    [e.id],
  );
  const seats = await query<{ id: string; section_id: string; label: string }>(
    `SELECT id, section_id, label FROM event_seats WHERE event_id = $1 ORDER BY label, id`,
    [e.id],
  );
  const org = await query<{ name: string }>(`SELECT name FROM organizer_profiles WHERE id = $1 LIMIT 1`, [e.organizer_profile_id]);
  const urls = await galleryUrls(e.id);
  const now = new Date();
  const starts = new Date(e.starts_at);
  const images = (urls.length ? urls : [dummyCover(e.category, e.title)]).map((url, i) => ({
    url,
    alt: i === 0 ? e.title : `${e.title} — ${i + 1}`,
  }));
  const sale = listSaleStatus(e.status, starts, tickets, now);
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    description: String(e.description || ""),
    category: e.category,
    organizer: { id: e.organizer_profile_id, name: org[0]?.name || "" },
    venueName: e.venue_name,
    addressLine: e.address_line,
    city: e.city,
    province: e.province,
    latitude: e.latitude,
    longitude: e.longitude,
    tags: Array.isArray(e.tags) ? e.tags.map(String).filter(Boolean) : [],
    timezone: e.timezone,
    startsAt: starts.toISOString(),
    endsAt: new Date(e.ends_at).toISOString(),
    terms: String(e.terms || ""),
    contactEmail: e.contact_email,
    contactPhone: e.contact_phone,
    inventoryMode: e.inventory_mode,
    image: images[0],
    images,
    seatMap:
      e.inventory_mode === "RESERVED_SEATING"
        ? { url: "/placeholder-event.svg", altText: "Denah venue belum tersedia", legend: "Denah statis akan tampil setelah diunggah organizer." }
        : null,
    sections: sections.map((s) => ({ id: s.id, name: s.name, ticketTypeId: s.ticket_type_id })),
    seats: seats.map((s) => ({ id: s.id, sectionId: s.section_id, label: s.label, saleStatus: sale })),
    ticketTypes: tickets.map((t) => {
      const quota = Number(t.quota) || 0;
      const remaining = Math.max(0, quota - Number(t.reserved_quantity || 0) - Number(t.paid_quantity || 0));
      let stockLabel = "AVAILABLE";
      if (remaining === 0) stockLabel = "SOLD_OUT";
      else if (remaining <= 5 || (quota > 0 && remaining * 10 <= quota)) stockLabel = "LOW";
      const price = Number(t.price_rupiah);
      return {
        id: t.id,
        name: t.name,
        description: t.description || "",
        priceRupiah: Number.isInteger(price) && price >= 0 ? price : 0,
        quota,
        saleStartsAt: new Date(t.sale_starts_at).toISOString(),
        saleEndsAt: new Date(t.sale_ends_at).toISOString(),
        maxPerAccount: Number(t.max_per_account) || 0,
        saleStatus: ticketSaleStatus(e.status, starts, t, now),
        remaining,
        stockLabel,
      };
    }),
    availabilityDisclaimer: "Label stok bersifat informatif. Kuota dan hold 15 menit dipastikan ulang saat checkout.",
  };
}
