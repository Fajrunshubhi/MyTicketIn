import { AppError, execute, newId, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";

const PROFILE_SELECT = `id, owner_user_id, name, contact_email, contact_phone, description, status::text AS status,
  decision_reason, submitted_at::text, decided_at::text, decided_by_user_id, created_at::text, updated_at::text, version`;

export type OrganizerProfile = {
  id: string;
  owner_user_id: string;
  name: string;
  contact_email: string;
  contact_phone: string | null;
  description: string;
  status: string;
  decision_reason: string | null;
  submitted_at: string;
  decided_at: string | null;
  decided_by_user_id: string | null;
  version: number;
};

function iso(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

export function ownerDto(p: OrganizerProfile) {
  return {
    id: p.id,
    name: p.name,
    contactEmail: p.contact_email,
    contactPhone: p.contact_phone,
    description: p.description,
    status: p.status,
    decisionReason: p.decision_reason,
    submittedAt: iso(p.submitted_at),
    version: p.version,
  };
}

export function listDto(p: OrganizerProfile) {
  const parts = p.contact_email.split("@");
  const contact =
    parts.length !== 2 || !parts[0]
      ? "••••"
      : parts[0].length === 1
        ? `*@${parts[1]}`
        : `${parts[0][0]}***@${parts[1]}`;
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    submittedAt: iso(p.submitted_at),
    contact,
    version: p.version,
  };
}

export async function getByOwner(userId: string): Promise<OrganizerProfile | null> {
  const rows = await query<OrganizerProfile>(`SELECT ${PROFILE_SELECT} FROM organizer_profiles WHERE owner_user_id = $1 LIMIT 1`, [userId]);
  return rows[0] || null;
}

export async function getById(id: string): Promise<OrganizerProfile | null> {
  const rows = await query<OrganizerProfile>(`SELECT ${PROFILE_SELECT} FROM organizer_profiles WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] || null;
}

function normalizeInput(name: string, email: string, phone: string, description: string) {
  const fields: Record<string, string> = {};
  const n = name.trim();
  if ([...n].length < 2 || [...n].length > 120) fields.name = "Nama organizer wajib 2–120 karakter.";
  const em = email.trim().toLowerCase();
  if (em.length > 254 || !em.includes("@")) fields.contactEmail = "Email kontak tidak valid.";
  const ph = phone.trim();
  let phoneOut: string | null = null;
  if (ph) {
    if (!/^\+?[0-9]{8,15}$/.test(ph)) fields.contactPhone = "Nomor telepon 8–15 digit, boleh diawali +.";
    else phoneOut = ph;
  }
  const d = description.trim();
  if ([...d].length < 20 || [...d].length > 2000) fields.description = "Deskripsi wajib 20–2000 karakter.";
  if (Object.keys(fields).length) throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", fields);
  return { name: n, email: em, phone: phoneOut, description: d };
}

export async function submitApplication(actor: AuthUser, body: { name: string; contactEmail: string; contactPhone?: string | null; description: string }) {
  if (actor.role !== "USER") throw new AppError("ORGANIZER_ACCESS_DENIED", "Anda tidak memiliki akses.", {}, 403);
  if (await getByOwner(actor.id)) throw new AppError("ORGANIZER_APPLICATION_EXISTS", "Pengajuan organizer sudah ada.", {}, 409);
  const in_ = normalizeInput(body.name || "", body.contactEmail || "", body.contactPhone || "", body.description || "");
  const id = newId();
  const rows = await query<OrganizerProfile>(
    `INSERT INTO organizer_profiles (id, owner_user_id, name, contact_email, contact_phone, description, status, submitted_at, created_at, updated_at, version)
     VALUES ($1,$2,$3,$4,$5,$6,'PENDING'::organizer_status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
     RETURNING ${PROFILE_SELECT}`,
    [id, actor.id, in_.name, in_.email, in_.phone, in_.description],
  );
  if (!rows[0]) throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan internal.", {}, 500);
  return rows[0];
}

export async function editApplication(actor: AuthUser, body: { name: string; contactEmail: string; contactPhone?: string | null; description: string; expectedVersion: number }) {
  const p = await getByOwner(actor.id);
  if (!p) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  if (p.status === "PENDING") throw new AppError("ORGANIZER_APPLICATION_PENDING", "Pengajuan masih ditinjau.", {}, 409);
  if (p.status === "APPROVED") throw new AppError("ORGANIZER_ALREADY_APPROVED", "Organizer sudah disetujui.", {}, 409);
  if (p.status !== "REJECTED") throw new AppError("ORGANIZER_TRANSITION_INVALID", "Transisi status tidak valid.", {}, 409);
  const in_ = normalizeInput(body.name || "", body.contactEmail || "", body.contactPhone || "", body.description || "");
  const n = await execute(
    `UPDATE organizer_profiles SET name=$1, contact_email=$2, contact_phone=$3, description=$4, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$5 AND version=$6`,
    [in_.name, in_.email, in_.phone, in_.description, p.id, body.expectedVersion],
  );
  if (!n) throw new AppError("ORGANIZER_VERSION_CONFLICT", "Data berubah.", {}, 409);
  const next = await getById(p.id);
  if (!next) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  return next;
}

export async function resubmitApplication(actor: AuthUser, expectedVersion: number) {
  const p = await getByOwner(actor.id);
  if (!p) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  if (p.status === "PENDING") throw new AppError("ORGANIZER_APPLICATION_PENDING", "Pengajuan masih ditinjau.", {}, 409);
  if (p.status !== "REJECTED") throw new AppError("ORGANIZER_TRANSITION_INVALID", "Transisi status tidak valid.", {}, 409);
  const n = await execute(
    `UPDATE organizer_profiles SET status='PENDING'::organizer_status, decision_reason=NULL, decided_at=NULL, decided_by_user_id=NULL,
            submitted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$1 AND version=$2`,
    [p.id, expectedVersion],
  );
  if (!n) throw new AppError("ORGANIZER_VERSION_CONFLICT", "Data berubah.", {}, 409);
  const next = await getById(p.id);
  if (!next) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  return next;
}

export async function listAdmin(status: string, q: string, limit: number) {
  const st = status.trim().toUpperCase();
  const queryText = q.trim();
  return query<OrganizerProfile>(
    `SELECT ${PROFILE_SELECT} FROM organizer_profiles
     WHERE ($1 = '' OR status::text = $1)
       AND ($2 = '' OR name ILIKE '%' || $2 || '%')
     ORDER BY submitted_at ASC, id ASC
     LIMIT $3`,
    [st === "ALL" ? "" : st, queryText, Math.min(Math.max(limit || 25, 1), 50)],
  );
}

function targetStatus(from: string, decision: string): string {
  if (decision === "APPROVE" && from === "PENDING") return "APPROVED";
  if (decision === "REJECT" && from === "PENDING") return "REJECTED";
  if (decision === "SUSPEND" && from === "APPROVED") return "SUSPENDED";
  if (decision === "RESTORE" && from === "SUSPENDED") return "APPROVED";
  throw new AppError("ORGANIZER_TRANSITION_INVALID", "Transisi status tidak valid.", {}, 409);
}

export async function decide(admin: AuthUser, id: string, decision: string, reason: string, expectedVersion: number) {
  const r = reason.trim();
  if ([...r].length < 10 || [...r].length > 1000) {
    throw new AppError("ORGANIZER_REASON_REQUIRED", "Alasan keputusan wajib 10–1000 karakter.", {}, 400);
  }
  const p = await getById(id);
  if (!p) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  const next = targetStatus(p.status, decision.trim().toUpperCase());
  const n = await execute(
    `UPDATE organizer_profiles SET status=$1::organizer_status, decision_reason=$2, decided_at=CURRENT_TIMESTAMP, decided_by_user_id=$3,
            updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$4 AND version=$5`,
    [next, r, admin.id, id, expectedVersion],
  );
  if (!n) throw new AppError("ORGANIZER_VERSION_CONFLICT", "Data berubah.", {}, 409);
  const out = await getById(id);
  if (!out) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  return out;
}

export type PublicOrganizer = { id: string; name: string; description: string; eventCount: number };

export async function getPublicOrganizer(id: string): Promise<PublicOrganizer | null> {
  const key = id.trim();
  if (!key) return null;
  const rows = await query<{ id: string; name: string; description: string; n: string }>(
    `SELECT p.id, p.name, p.description, COUNT(e.id)::text AS n
     FROM organizer_profiles p
     LEFT JOIN events e ON e.organizer_profile_id = p.id AND e.status IN ('PUBLISHED', 'COMPLETED')
     WHERE p.id = $1 AND p.status = 'APPROVED'
     GROUP BY p.id, p.name, p.description
     LIMIT 1`,
    [key],
  );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, name: row.name, description: String(row.description || ""), eventCount: Number(row.n || 0) };
}

export type LandingOrganizer = { id: string; name: string; eventCount: number };

export async function listLandingOrganizers(limit = 24): Promise<LandingOrganizer[]> {
  const cap = Math.min(Math.max(limit || 24, 1), 200);
  const rows = await query<{ id: string; name: string; n: string }>(
    `SELECT p.id, p.name, COUNT(e.id)::text AS n
     FROM organizer_profiles p
     LEFT JOIN events e ON e.organizer_profile_id = p.id AND e.status IN ('PUBLISHED', 'COMPLETED')
     WHERE p.status = 'APPROVED'
     GROUP BY p.id, p.name
     ORDER BY COUNT(e.id) DESC, lower(p.name) ASC, p.id ASC
     LIMIT $1`,
    [cap],
  );
  return rows.map((row) => ({ id: row.id, name: row.name, eventCount: Number(row.n || 0) }));
}
