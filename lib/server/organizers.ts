import { AppError, execute, newId, query } from "@/lib/server/http";
import { notify, notifyAdmins } from "@/lib/server/notifications";
import type { AuthUser } from "@/lib/server/access";
import { isParsedRefundBank, parseRefundBank, type ParsedRefundBank } from "@/lib/server/refund-policy";
import { deleteDocuments, documentFlags, saveDocument, validateDocument } from "@/lib/server/organizer-documents";

const PROFILE_SELECT = `id, owner_user_id, name, contact_email, contact_phone, description, status::text AS status,
  decision_reason, submitted_at::text, decided_at::text, decided_by_user_id, created_at::text, updated_at::text, version,
  appeal_reason, appealed_at::text, organizer_type, pic_name, city, reference_url, data_consent_at::text,
  bank_name, bank_account_name, bank_account_number`;

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
  appeal_reason: string | null;
  appealed_at: string | null;
  organizer_type: string | null;
  pic_name: string | null;
  city: string | null;
  reference_url: string | null;
  data_consent_at: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
};

export function iso(v: string | null | undefined): string | null {
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
    decidedAt: iso(p.decided_at),
    appealReason: p.appeal_reason,
    appealedAt: iso(p.appealed_at),
    organizerType: p.organizer_type,
    picName: p.pic_name,
    city: p.city,
    referenceUrl: p.reference_url,
    bankName: p.bank_name,
    bankAccountName: p.bank_account_name,
    bankAccountNumber: p.bank_account_number,
    dataConsentAt: iso(p.data_consent_at),
    version: p.version,
  };
}

export type OrganizerHistoryActor = "OWNER" | "ADMIN";
export type OrganizerHistoryType =
  | "SUBMITTED"
  | "EDITED"
  | "RESUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED"
  | "RESTORED"
  | "APPEALED"
  | "APPEAL_DISMISSED"
  | "REVOKED"
  | "CHANGE_REQUESTED"
  | "CHANGE_APPROVED"
  | "CHANGE_REJECTED"
  | "CHANGE_CANCELLED";

export type OrganizerHistoryEntry = {
  id: string;
  occurredAt: string;
  actor: OrganizerHistoryActor;
  type: OrganizerHistoryType;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
};

export function historyDto(row: {
  id: string;
  occurred_at: string;
  actor_role: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
}): OrganizerHistoryEntry {
  return {
    id: row.id,
    occurredAt: iso(row.occurred_at) || new Date().toISOString(),
    actor: row.actor_role === "ADMIN" ? "ADMIN" : "OWNER",
    type: row.event_type as OrganizerHistoryType,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
  };
}

export function decisionHistoryType(decision: string): OrganizerHistoryType {
  if (decision === "APPROVE") return "APPROVED";
  if (decision === "REJECT") return "REJECTED";
  if (decision === "SUSPEND") return "SUSPENDED";
  if (decision === "RESTORE") return "RESTORED";
  if (decision === "DISMISS_APPEAL") return "APPEAL_DISMISSED";
  if (decision === "REVOKE") return "REVOKED";
  throw new AppError("ORGANIZER_TRANSITION_INVALID", "Transisi status tidak valid.", {}, 409);
}

export async function appendHistory(input: {
  profileId: string;
  actor: OrganizerHistoryActor;
  type: OrganizerHistoryType;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
}) {
  await execute(
    `INSERT INTO organizer_profile_history (id, organizer_profile_id, occurred_at, actor_role, event_type, from_status, to_status, note)
     VALUES ($1,$2,CURRENT_TIMESTAMP,$3,$4,$5::organizer_status,$6::organizer_status,$7)`,
    [newId(), input.profileId, input.actor, input.type, input.fromStatus || null, input.toStatus || null, input.note || null],
  );
}

export async function listHistory(profileId: string): Promise<OrganizerHistoryEntry[]> {
  const rows = await query<{
    id: string;
    occurred_at: string;
    actor_role: string;
    event_type: string;
    from_status: string | null;
    to_status: string | null;
    note: string | null;
  }>(
    `SELECT id, occurred_at::text, actor_role, event_type, from_status::text AS from_status, to_status::text AS to_status, note
     FROM organizer_profile_history
     WHERE organizer_profile_id = $1
     ORDER BY occurred_at DESC, id DESC
     LIMIT 100`,
    [profileId],
  );
  return rows.map(historyDto);
}

export function listDto(p: OrganizerProfile & { has_pending_change?: boolean }) {
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
    hasAppeal: Boolean(p.appeal_reason),
    hasPendingChange: Boolean(p.has_pending_change),
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

export type ApplicationBody = {
  name: string;
  contactEmail: string;
  contactPhone?: string | null;
  description: string;
  organizerType: string;
  picName: string;
  city: string;
  referenceUrl: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  consent: boolean;
};

export type ApplicationFiles = { ktp?: Buffer | null; selfie?: Buffer | null };

export function normalizeInput(body: ApplicationBody) {
  const fields: Record<string, string> = {};
  const n = (body.name || "").trim();
  if ([...n].length < 2 || [...n].length > 120) fields.name = "Nama organizer wajib 2–120 karakter.";
  const em = (body.contactEmail || "").trim().toLowerCase();
  if (em.length > 254 || !em.includes("@")) fields.contactEmail = "Email kontak tidak valid.";
  const ph = (body.contactPhone || "").trim();
  if (!/^\+?[0-9]{8,15}$/.test(ph)) fields.contactPhone = "Nomor telepon wajib, 8–15 digit, boleh diawali +.";
  const d = (body.description || "").trim();
  if ([...d].length < 20 || [...d].length > 2000) fields.description = "Deskripsi wajib 20–2000 karakter.";
  const type = (body.organizerType || "").trim().toUpperCase();
  if (type !== "INDIVIDUAL" && type !== "ORGANIZATION") fields.organizerType = "Pilih jenis penyelenggara.";
  const pic = (body.picName || "").trim().replace(/\s+/g, " ");
  if (pic.length < 3 || pic.length > 120 || !/^[A-Za-z .,'-]+$/.test(pic)) {
    fields.picName = "Nama penanggung jawab 3–120 huruf, sesuai KTP.";
  }
  const city = (body.city || "").trim();
  if ([...city].length < 2 || [...city].length > 80) fields.city = "Kota/kabupaten wajib 2–80 karakter.";
  const ref = (body.referenceUrl || "").trim();
  let refOut = "";
  try {
    const u = new URL(ref);
    if ((u.protocol === "https:" || u.protocol === "http:") && ref.length <= 300) refOut = u.toString();
  } catch {
    /* handled below */
  }
  if (!refOut) fields.referenceUrl = "Tautan bukti harus URL http(s) yang valid, maksimal 300 karakter.";
  const bank = parseRefundBank({
    bankName: body.bankName,
    accountName: body.bankAccountName,
    accountNumber: body.bankAccountNumber,
  });
  if (!isParsedRefundBank(bank)) {
    const map: Record<string, string> = { bankName: "bankName", accountName: "bankAccountName", accountNumber: "bankAccountNumber" };
    fields[map[bank.field] || "bankName"] = bank.error;
  }
  if (body.consent !== true) fields.consent = "Persetujuan pemrosesan data wajib dicentang.";
  if (Object.keys(fields).length) throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", fields);
  return { name: n, email: em, phone: ph, description: d, type, pic, city, referenceUrl: refOut, bank: bank as ParsedRefundBank };
}

export async function submitApplication(actor: AuthUser, body: ApplicationBody, files: ApplicationFiles) {
  if (actor.role !== "USER") throw new AppError("ORGANIZER_ACCESS_DENIED", "Anda tidak memiliki akses.", {}, 403);
  if (await getByOwner(actor.id)) throw new AppError("ORGANIZER_APPLICATION_EXISTS", "Pengajuan organizer sudah ada.", {}, 409);
  const in_ = normalizeInput(body);
  // Validate both images before anything is written so a bad file never leaves a half-created application.
  validateDocument("KTP", files.ktp ?? Buffer.alloc(0));
  validateDocument("SELFIE", files.selfie ?? Buffer.alloc(0));
  const id = newId();
  const rows = await query<OrganizerProfile>(
    `INSERT INTO organizer_profiles (id, owner_user_id, name, contact_email, contact_phone, description, status, submitted_at, created_at, updated_at, version,
                                     organizer_type, pic_name, city, reference_url, data_consent_at,
                                     bank_name, bank_account_name, bank_account_number)
     VALUES ($1,$2,$3,$4,$5,$6,'PENDING'::organizer_status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1,
             $7,$8,$9,$10,CURRENT_TIMESTAMP,$11,$12,$13)
     RETURNING ${PROFILE_SELECT}`,
    [id, actor.id, in_.name, in_.email, in_.phone, in_.description, in_.type, in_.pic, in_.city, in_.referenceUrl, in_.bank.bankName, in_.bank.accountName, in_.bank.accountNumber],
  );
  if (!rows[0]) throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan internal.", {}, 500);
  try {
    await saveDocument(rows[0].id, "KTP", files.ktp as Buffer);
    await saveDocument(rows[0].id, "SELFIE", files.selfie as Buffer);
  } catch (err) {
    // No transaction on the HTTP driver: undo the application so the user can retry cleanly.
    await deleteDocuments(rows[0].id).catch(() => 0);
    await execute(`DELETE FROM organizer_profiles WHERE id=$1 AND status='PENDING'::organizer_status`, [rows[0].id]).catch(() => 0);
    throw err;
  }
  await appendHistory({
    profileId: rows[0].id,
    actor: "OWNER",
    type: "SUBMITTED",
    toStatus: "PENDING",
  });
  await notifyAdmins({
    type: "MODERATION_NEEDED",
    title: "Pengajuan organizer baru",
    body: `${rows[0].name} mengajukan diri sebagai penyelenggara. Tinjau berkas sebelum menyetujui.`,
    actionPath: `/admin/organizers/${rows[0].id}`,
    entityType: "OrganizerProfile",
    entityId: rows[0].id,
    deduplicationKey: `org-app:${rows[0].id}:submit`,
    domainEventId: `org-app:${rows[0].id}:submit`,
  });
  return rows[0];
}

export async function editApplication(actor: AuthUser, body: ApplicationBody & { expectedVersion: number }, files: ApplicationFiles = {}) {
  const p = await getByOwner(actor.id);
  if (!p) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  if (p.status === "PENDING") throw new AppError("ORGANIZER_APPLICATION_PENDING", "Pengajuan masih ditinjau.", {}, 409);
  if (p.status === "APPROVED") throw new AppError("ORGANIZER_ALREADY_APPROVED", "Organizer sudah disetujui.", {}, 409);
  if (p.status !== "REJECTED") throw new AppError("ORGANIZER_TRANSITION_INVALID", "Transisi status tidak valid.", {}, 409);
  const in_ = normalizeInput(body);
  if (files.ktp?.length) validateDocument("KTP", files.ktp);
  if (files.selfie?.length) validateDocument("SELFIE", files.selfie);
  const n = await execute(
    `UPDATE organizer_profiles SET name=$1, contact_email=$2, contact_phone=$3, description=$4,
            organizer_type=$7, pic_name=$8, city=$9, reference_url=$10, data_consent_at=CURRENT_TIMESTAMP,
            bank_name=$11, bank_account_name=$12, bank_account_number=$13,
            updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$5 AND version=$6`,
    [in_.name, in_.email, in_.phone, in_.description, p.id, body.expectedVersion, in_.type, in_.pic, in_.city, in_.referenceUrl, in_.bank.bankName, in_.bank.accountName, in_.bank.accountNumber],
  );
  if (!n) throw new AppError("ORGANIZER_VERSION_CONFLICT", "Data berubah.", {}, 409);
  if (files.ktp?.length) await saveDocument(p.id, "KTP", files.ktp);
  if (files.selfie?.length) await saveDocument(p.id, "SELFIE", files.selfie);
  const next = await getById(p.id);
  if (!next) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  await appendHistory({
    profileId: next.id,
    actor: "OWNER",
    type: "EDITED",
    fromStatus: "REJECTED",
    toStatus: "REJECTED",
  });
  return next;
}

export async function resubmitApplication(actor: AuthUser, expectedVersion: number) {
  const p = await getByOwner(actor.id);
  if (!p) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  if (p.status === "PENDING") throw new AppError("ORGANIZER_APPLICATION_PENDING", "Pengajuan masih ditinjau.", {}, 409);
  if (p.status !== "REJECTED") throw new AppError("ORGANIZER_TRANSITION_INVALID", "Transisi status tidak valid.", {}, 409);
  if (!p.bank_account_number) {
    throw new AppError("VALIDATION_ERROR", "Lengkapi data rekening sebelum mengajukan ulang.", { bankAccountNumber: "Nomor rekening wajib diisi." }, 400);
  }
  const flags = await documentFlags(p.id);
  if (!flags.hasKtp || !flags.hasSelfie) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Unggah ulang foto KTP dan foto selfie sebelum mengajukan ulang.",
      { ktp: flags.hasKtp ? "" : "Foto KTP wajib.", selfie: flags.hasSelfie ? "" : "Foto selfie wajib." },
      400,
    );
  }
  const n = await execute(
    `UPDATE organizer_profiles SET status='PENDING'::organizer_status, decision_reason=NULL, decided_at=NULL, decided_by_user_id=NULL,
            submitted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$1 AND version=$2`,
    [p.id, expectedVersion],
  );
  if (!n) throw new AppError("ORGANIZER_VERSION_CONFLICT", "Data berubah.", {}, 409);
  const next = await getById(p.id);
  if (!next) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  await appendHistory({
    profileId: next.id,
    actor: "OWNER",
    type: "RESUBMITTED",
    fromStatus: "REJECTED",
    toStatus: "PENDING",
  });
  await notifyAdmins({
    type: "MODERATION_NEEDED",
    title: "Pengajuan organizer diajukan ulang",
    body: `${next.name} mengirim ulang berkas penyelenggara.`,
    actionPath: `/admin/organizers/${next.id}`,
    entityType: "OrganizerProfile",
    entityId: next.id,
    deduplicationKey: `org-app:${next.id}:resubmit:${next.version}`,
    domainEventId: `org-app:${next.id}:resubmit:${next.version}`,
  });
  return next;
}

export async function listAdmin(status: string, q: string, limit: number) {
  const st = status.trim().toUpperCase();
  const queryText = q.trim();
  return query<OrganizerProfile & { has_pending_change?: boolean }>(
    `SELECT ${PROFILE_SELECT},
            EXISTS (SELECT 1 FROM organizer_change_requests c WHERE c.organizer_profile_id = organizer_profiles.id AND c.status = 'PENDING') AS has_pending_change
     FROM organizer_profiles
     WHERE ($1 = '' OR status::text = $1)
       AND ($2 = '' OR name ILIKE '%' || $2 || '%')
     ORDER BY submitted_at ASC, id ASC
     LIMIT $3`,
    [st === "ALL" ? "" : st, queryText, Math.min(Math.max(limit || 25, 1), 50)],
  );
}

export function targetStatus(from: string, decision: string): string {
  if (decision === "APPROVE" && from === "PENDING") return "APPROVED";
  if (decision === "REJECT" && from === "PENDING") return "REJECTED";
  if (decision === "SUSPEND" && from === "APPROVED") return "SUSPENDED";
  if (decision === "RESTORE" && from === "SUSPENDED") return "APPROVED";
  if (decision === "DISMISS_APPEAL" && from === "SUSPENDED") return "SUSPENDED";
  if (decision === "REVOKE" && from === "SUSPENDED") return "REJECTED";
  throw new AppError("ORGANIZER_TRANSITION_INVALID", "Transisi status tidak valid.", {}, 409);
}

export async function decide(admin: AuthUser, id: string, decision: string, reason: string, expectedVersion: number) {
  const r = reason.trim();
  if ([...r].length < 10 || [...r].length > 1000) {
    throw new AppError("ORGANIZER_REASON_REQUIRED", "Alasan keputusan wajib 10–1000 karakter.", {}, 400);
  }
  const p = await getById(id);
  if (!p) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  const action = decision.trim().toUpperCase();
  const next = targetStatus(p.status, action);
  const clearAppeal = action !== "DISMISS_APPEAL";
  const n = await execute(
    `UPDATE organizer_profiles SET status=$1::organizer_status, decision_reason=$2, decided_at=CURRENT_TIMESTAMP, decided_by_user_id=$3,
            appeal_reason=CASE WHEN $6::boolean THEN NULL ELSE appeal_reason END,
            appealed_at=CASE WHEN $6::boolean THEN NULL ELSE appealed_at END,
            updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$4 AND version=$5`,
    [next, r, admin.id, id, expectedVersion, clearAppeal],
  );
  if (!n) throw new AppError("ORGANIZER_VERSION_CONFLICT", "Data berubah.", {}, 409);
  const out = await getById(id);
  if (!out) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  await appendHistory({
    profileId: out.id,
    actor: "ADMIN",
    type: decisionHistoryType(action),
    fromStatus: p.status,
    toStatus: next,
    note: r,
  });
  const type =
    next === "APPROVED" ? "ORGANIZER_APPROVED" : next === "SUSPENDED" ? "ORGANIZER_SUSPENDED" : "ORGANIZER_REJECTED";
  const titles = {
    ORGANIZER_APPROVED: "Akun penyelenggara disetujui",
    ORGANIZER_SUSPENDED: "Akun penyelenggara ditangguhkan",
    ORGANIZER_REJECTED: "Pengajuan penyelenggara ditolak",
  } as const;
  await notify({
    recipientUserId: out.owner_user_id,
    type,
    title: titles[type],
    body:
      type === "ORGANIZER_APPROVED"
        ? "Anda dapat membuat event dan membuka portal penyelenggara."
        : `Keputusan admin: ${r.slice(0, 400)}`,
    actionPath: "/dashboard/organizer/status",
    entityType: "OrganizerProfile",
    entityId: out.id,
    deduplicationKey: `org-decision:${out.id}:${out.version}`,
    domainEventId: `org-decision:${out.id}:${out.version}`,
  });
  return out;
}

export async function appealSuspension(actor: AuthUser, reason: string, expectedVersion: number) {
  const p = await getByOwner(actor.id);
  if (!p) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  if (p.status !== "SUSPENDED") {
    throw new AppError("ORGANIZER_APPEAL_INVALID", "Sanggahan hanya untuk organizer yang ditangguhkan.", {}, 409);
  }
  const why = reason.trim();
  if ([...why].length < 10 || [...why].length > 1000) {
    throw new AppError("ORGANIZER_REASON_REQUIRED", "Alasan sanggahan wajib 10–1000 karakter.", {}, 400);
  }
  const n = await execute(
    `UPDATE organizer_profiles SET appeal_reason=$1, appealed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$2 AND version=$3 AND status='SUSPENDED'::organizer_status`,
    [why, p.id, expectedVersion],
  );
  if (!n) throw new AppError("ORGANIZER_VERSION_CONFLICT", "Data berubah.", {}, 409);
  const next = await getById(p.id);
  if (!next) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  await appendHistory({
    profileId: next.id,
    actor: "OWNER",
    type: "APPEALED",
    fromStatus: "SUSPENDED",
    toStatus: "SUSPENDED",
    note: why,
  });
  await notifyAdmins({
    type: "MODERATION_NEEDED",
    title: "Sanggahan penangguhan",
    body: `${next.name} mengirim sanggahan atas penangguhan akun.`,
    actionPath: `/admin/organizers/${next.id}`,
    entityType: "OrganizerProfile",
    entityId: next.id,
    deduplicationKey: `org-appeal:${next.id}:${next.version}`,
    domainEventId: `org-appeal:${next.id}:${next.version}`,
  });
  return next;
}

export type PublicOrganizer = { id: string; name: string; description: string; eventCount: number; status?: string };

export async function getPublicOrganizer(id: string): Promise<PublicOrganizer | null> {
  const key = id.trim();
  if (!key) return null;
  const rows = await query<{ id: string; name: string; description: string; n: string; status: string }>(
    `SELECT p.id, p.name, p.description, p.status::text AS status, COUNT(e.id)::text AS n
     FROM organizer_profiles p
     LEFT JOIN events e ON e.organizer_profile_id = p.id AND e.status IN ('PUBLISHED', 'COMPLETED')
     WHERE p.id = $1 AND p.status IN ('APPROVED', 'SUSPENDED', 'REJECTED')
     GROUP BY p.id, p.name, p.description, p.status
     LIMIT 1`,
    [key],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: String(row.description || ""),
    eventCount: Number(row.n || 0),
    status: row.status,
  };
}

export type LandingOrganizer = { id: string; name: string; eventCount: number };

export async function listLandingOrganizers(limit = 24): Promise<LandingOrganizer[]> {
  const cap = Math.min(Math.max(limit || 24, 1), 200);
  const rows = await query<{ id: string; name: string; n: string }>(
    `SELECT p.id, p.name, COUNT(e.id)::text AS n
     FROM organizer_profiles p
     LEFT JOIN events e ON e.organizer_profile_id = p.id AND e.status IN ('PUBLISHED', 'COMPLETED')
     WHERE p.status IN ('APPROVED', 'SUSPENDED')
     GROUP BY p.id, p.name
     ORDER BY COUNT(e.id) DESC, lower(p.name) ASC, p.id ASC
     LIMIT $1`,
    [cap],
  );
  return rows.map((row) => ({ id: row.id, name: row.name, eventCount: Number(row.n || 0) }));
}
