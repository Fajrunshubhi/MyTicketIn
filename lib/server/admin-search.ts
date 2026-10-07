import { AppError, execute, newId, query } from "@/lib/server/http";

export const ADMIN_SEARCH_TYPES = [
  "all",
  "users",
  "organizers",
  "events",
  "orders",
  "payments",
  "tickets",
] as const;
export type AdminSearchType = (typeof ADMIN_SEARCH_TYPES)[number];

export type AdminSearchItem = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  href: string;
};
export type AdminSearchGroup = {
  type: Exclude<AdminSearchType, "all">;
  label: string;
  items: AdminSearchItem[];
  hasMore: boolean;
};

const MIN_QUERY = 2;
const MAX_QUERY = 80;

/** Escape LIKE wildcards so user input is always a literal substring. */
export function likePattern(raw: string): string {
  return `%${raw.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function parseAdminSearch(sp: URLSearchParams) {
  const q = (sp.get("q") || "").trim().slice(0, MAX_QUERY);
  if (q.length < MIN_QUERY)
    throw new AppError(
      "VALIDATION_ERROR",
      "Masukkan minimal 2 karakter.",
      {},
      400,
    );
  const rawType = (sp.get("type") || "all").toLowerCase();
  const type = (ADMIN_SEARCH_TYPES as readonly string[]).includes(rawType)
    ? (rawType as AdminSearchType)
    : "all";
  const page = Math.max(1, Math.floor(Number(sp.get("page") || 1)) || 1);
  return { q, type, page };
}

type Row = Record<string, unknown>;
type Spec = {
  label: string;
  sql: string;
  map: (r: Row) => AdminSearchItem;
};

// Only non-sensitive columns are selected: no password hash, QR token, manual code, or payment instruction data.
const SPECS: Record<Exclude<AdminSearchType, "all">, Spec> = {
  users: {
    label: "Pengguna",
    sql: `SELECT id, name, username, email, role FROM users
          WHERE name ILIKE $1 OR username ILIKE $1 OR email ILIKE $1 OR id = $2
          ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
    map: (r) => ({
      id: String(r.id),
      title: String(r.name),
      subtitle: `@${r.username} · ${r.email}`,
      status: String(r.role),
      href: `/admin/audit?actorUserId=${encodeURIComponent(String(r.id))}`,
    }),
  },
  organizers: {
    label: "Organizer",
    sql: `SELECT id, name, contact_email, status::text AS status FROM organizer_profiles
          WHERE name ILIKE $1 OR contact_email ILIKE $1 OR id = $2
          ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
    map: (r) => ({
      id: String(r.id),
      title: String(r.name),
      subtitle: String(r.contact_email),
      status: String(r.status),
      href: `/admin/organizers/${encodeURIComponent(String(r.id))}`,
    }),
  },
  events: {
    label: "Event",
    sql: `SELECT e.id, e.title, e.city, e.starts_at::text AS starts_at, e.status::text AS status, o.name AS organizer_name
          FROM events e JOIN organizer_profiles o ON o.id=e.organizer_profile_id
          WHERE e.title ILIKE $1 OR e.slug ILIKE $1 OR o.name ILIKE $1 OR e.id = $2
          ORDER BY e.created_at DESC, e.id DESC LIMIT $3 OFFSET $4`,
    map: (r) => ({
      id: String(r.id),
      title: String(r.title),
      subtitle: `${r.organizer_name} · ${r.city}`,
      status: String(r.status),
      href: `/admin/events/${encodeURIComponent(String(r.id))}`,
    }),
  },
  orders: {
    label: "Order",
    sql: `SELECT o.id, o.order_number, o.status::text AS status, o.total_payable_rupiah, e.title AS event_title
          FROM orders o JOIN events e ON e.id=o.event_id
          WHERE o.order_number ILIKE $1 OR o.id = $2
          ORDER BY o.created_at DESC, o.id DESC LIMIT $3 OFFSET $4`,
    map: (r) => ({
      id: String(r.id),
      title: String(r.order_number),
      subtitle: `${r.event_title} · Rp${Number(r.total_payable_rupiah).toLocaleString("id-ID")}`,
      status: String(r.status),
      href: `/admin/audit?entityType=order&entityId=${encodeURIComponent(String(r.id))}`,
    }),
  },
  payments: {
    label: "Pembayaran",
    sql: `SELECT p.id, p.provider, p.method::text AS method, p.amount_rupiah, p.status::text AS status, o.order_number
          FROM payments p JOIN orders o ON o.id=p.order_id
          WHERE p.external_reference ILIKE $1 OR o.order_number ILIKE $1 OR p.id = $2
          ORDER BY p.created_at DESC, p.id DESC LIMIT $3 OFFSET $4`,
    map: (r) => ({
      id: String(r.id),
      title: `${r.order_number} · ${r.method}`,
      subtitle: `${r.provider} · Rp${Number(r.amount_rupiah).toLocaleString("id-ID")}`,
      status: String(r.status),
      href: `/admin/payment-reconciliations`,
    }),
  },
  tickets: {
    label: "Tiket",
    sql: `SELECT t.id, t.ticket_number, t.ticket_type_name, t.status::text AS status, e.title AS event_title
          FROM tickets t JOIN events e ON e.id=t.event_id
          WHERE t.ticket_number ILIKE $1 OR t.id = $2
          ORDER BY t.issued_at DESC, t.id DESC LIMIT $3 OFFSET $4`,
    map: (r) => ({
      id: String(r.id),
      title: String(r.ticket_number),
      subtitle: `${r.event_title} · ${r.ticket_type_name}`,
      status: String(r.status),
      href: `/admin/audit?entityType=ticket&entityId=${encodeURIComponent(String(r.id))}`,
    }),
  },
};

export async function adminSearch(
  adminId: string,
  input: { q: string; type: AdminSearchType; page: number },
  correlation: string,
) {
  const types = (
    input.type === "all" ? Object.keys(SPECS) : [input.type]
  ) as Exclude<AdminSearchType, "all">[];
  // "all" shows a short preview per entity; a single entity is paginated.
  const size = input.type === "all" ? 5 : 20;
  const offset = input.type === "all" ? 0 : (input.page - 1) * size;
  const pattern = likePattern(input.q);

  const groups: AdminSearchGroup[] = await Promise.all(
    types.map(async (t) => {
      const spec = SPECS[t];
      const rows = await query<Row>(spec.sql, [
        pattern,
        input.q,
        size + 1,
        offset,
      ]);
      return {
        type: t,
        label: spec.label,
        items: rows.slice(0, size).map(spec.map),
        hasMore: rows.length > size,
      };
    }),
  );

  // Audit the access without storing the raw query (it may be PII); only type and length.
  await execute(
    `INSERT INTO audit_logs (id, actor_type, actor_user_id, action, entity_type, outcome, correlation_id, metadata)
     VALUES ($1,'USER',$2,'admin.search','search','SUCCESS',$3,$4::jsonb)`,
    [
      newId(),
      adminId,
      correlation,
      JSON.stringify({
        type: input.type,
        queryLength: input.q.length,
        page: input.page,
      }),
    ],
  ).catch(() => 0);

  return { groups, page: input.page };
}
