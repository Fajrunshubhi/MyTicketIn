import { AppError, execute, newId, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { notify, notifyAdmins } from "@/lib/server/notifications";
import { asBuffer } from "@/lib/server/tickets";
import { openDocument, sealDocument } from "@/lib/server/document-crypto";
import {
  documentFlags,
  saveDocument,
  validateDocument,
  fieldFor,
  type DocumentKind,
  DOCUMENT_KINDS,
  REJECTED_RETENTION_DAYS,
} from "@/lib/server/organizer-documents";
import {
  appendHistory,
  getById,
  getByOwner,
  iso,
  normalizeInput,
  type ApplicationBody,
  type ApplicationFiles,
  type OrganizerProfile,
} from "@/lib/server/organizers";

type ChangeRow = {
  id: string;
  organizer_profile_id: string;
  status: string;
  base_version: number;
  name: string;
  contact_email: string;
  contact_phone: string;
  description: string;
  organizer_type: string;
  pic_name: string;
  city: string;
  reference_url: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  data_consent_at: string;
  submitted_at: string;
  decided_at: string | null;
  decision_reason: string | null;
};

const CHANGE_SELECT = `id, organizer_profile_id, status, base_version, name, contact_email, contact_phone, description,
  organizer_type, pic_name, city, reference_url, bank_name, bank_account_name, bank_account_number,
  data_consent_at::text, submitted_at::text, decided_at::text, decision_reason`;

const aadFor = (requestId: string, kind: DocumentKind) => `organizer-change:${requestId}:${kind}`;

async function changeDocFlags(requestId: string): Promise<{ hasKtp: boolean; hasSelfie: boolean }> {
  const rows = await query<{ kind: string }>(
    `SELECT kind FROM organizer_change_request_documents WHERE change_request_id=$1`,
    [requestId],
  );
  return { hasKtp: rows.some((r) => r.kind === "KTP"), hasSelfie: rows.some((r) => r.kind === "SELFIE") };
}

export function changeDto(c: ChangeRow, flags: { hasKtp: boolean; hasSelfie: boolean }) {
  return {
    id: c.id,
    status: c.status,
    baseVersion: Number(c.base_version),
    name: c.name,
    contactEmail: c.contact_email,
    contactPhone: c.contact_phone,
    description: c.description,
    organizerType: c.organizer_type,
    picName: c.pic_name,
    city: c.city,
    referenceUrl: c.reference_url,
    bankName: c.bank_name,
    bankAccountName: c.bank_account_name,
    bankAccountNumber: c.bank_account_number,
    submittedAt: iso(c.submitted_at),
    decidedAt: iso(c.decided_at),
    decisionReason: c.decision_reason,
    newKtp: flags.hasKtp,
    newSelfie: flags.hasSelfie,
  };
}

async function saveChangeDocument(requestId: string, kind: DocumentKind, bytes: Buffer): Promise<void> {
  const { mime } = validateDocument(kind, bytes);
  const sealed = sealDocument(bytes, aadFor(requestId, kind));
  await execute(
    `INSERT INTO organizer_change_request_documents (id, change_request_id, kind, mime_type, byte_size, nonce, auth_tag, ciphertext)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (change_request_id, kind) DO UPDATE
       SET mime_type=EXCLUDED.mime_type, byte_size=EXCLUDED.byte_size, nonce=EXCLUDED.nonce,
           auth_tag=EXCLUDED.auth_tag, ciphertext=EXCLUDED.ciphertext`,
    [newId(), requestId, kind, mime, bytes.length, sealed.nonce, sealed.tag, sealed.ciphertext],
  );
}

async function readChangeDocument(requestId: string, kind: DocumentKind): Promise<{ bytes: Buffer; mime: string }> {
  const rows = await query<{ mime_type: string; nonce: unknown; auth_tag: unknown; ciphertext: unknown }>(
    `SELECT mime_type, nonce, auth_tag, ciphertext FROM organizer_change_request_documents
     WHERE change_request_id=$1 AND kind=$2 LIMIT 1`,
    [requestId, kind],
  );
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Dokumen tidak ditemukan.", {}, 404);
  try {
    const bytes = openDocument(
      { nonce: asBuffer(row.nonce), tag: asBuffer(row.auth_tag), ciphertext: asBuffer(row.ciphertext) },
      aadFor(requestId, kind),
    );
    return { bytes, mime: row.mime_type };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("INTERNAL_ERROR", "Dokumen tidak dapat dibuka.", {}, 500);
  }
}

async function deleteChangeDocuments(requestId: string): Promise<void> {
  await execute(`DELETE FROM organizer_change_request_documents WHERE change_request_id=$1`, [requestId]);
}

export async function getPendingChange(profileId: string): Promise<ChangeRow | null> {
  const rows = await query<ChangeRow>(
    `SELECT ${CHANGE_SELECT} FROM organizer_change_requests WHERE organizer_profile_id=$1 AND status='PENDING' LIMIT 1`,
    [profileId],
  );
  return rows[0] || null;
}

export async function getChangeById(id: string): Promise<ChangeRow | null> {
  const rows = await query<ChangeRow>(`SELECT ${CHANGE_SELECT} FROM organizer_change_requests WHERE id=$1 LIMIT 1`, [id]);
  return rows[0] || null;
}

/** Owner view: the open request, or else the most recent decided one so a rejection reason stays visible. */
export async function ownerChangeView(profileId: string) {
  const pending = await getPendingChange(profileId);
  if (pending) return { pending: changeDto(pending, await changeDocFlags(pending.id)), lastRejected: null };
  const last = await query<ChangeRow>(
    `SELECT ${CHANGE_SELECT} FROM organizer_change_requests
     WHERE organizer_profile_id=$1 AND status IN ('APPROVED','REJECTED') ORDER BY decided_at DESC NULLS LAST LIMIT 1`,
    [profileId],
  );
  const row = last[0];
  return {
    pending: null,
    lastRejected: row && row.status === "REJECTED" ? { decidedAt: iso(row.decided_at), reason: row.decision_reason } : null,
  };
}

export async function adminChangeView(profileId: string) {
  const pending = await getPendingChange(profileId);
  if (!pending) return null;
  return changeDto(pending, await changeDocFlags(pending.id));
}

/**
 * An approved organizer proposes new verified data. Nothing on the live profile changes until an admin approves,
 * so identity and bank details cannot be swapped silently.
 */
export async function submitChange(
  actor: AuthUser,
  body: ApplicationBody & { expectedVersion: number },
  files: ApplicationFiles,
): Promise<ChangeRow> {
  const profile = await getByOwner(actor.id);
  if (!profile) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  if (profile.status !== "APPROVED") {
    throw new AppError("ORGANIZER_CHANGE_NOT_ALLOWED", "Perubahan data hanya untuk penyelenggara yang disetujui.", {}, 409);
  }
  if (Number(profile.version) !== Number(body.expectedVersion)) {
    throw new AppError("ORGANIZER_VERSION_CONFLICT", "Data berubah. Muat ulang halaman.", {}, 409);
  }
  const in_ = normalizeInput(body);
  const flags = await documentFlags(profile.id);
  // A document is required only when the live profile has none yet (organizers approved before KTP/selfie existed).
  const fileErrors: Record<string, string> = {};
  for (const kind of DOCUMENT_KINDS) {
    const bytes = kind === "KTP" ? files.ktp : files.selfie;
    const has = kind === "KTP" ? flags.hasKtp : flags.hasSelfie;
    if (bytes?.length) validateDocument(kind, bytes);
    else if (!has) fileErrors[fieldFor(kind)] = kind === "KTP" ? "Foto KTP wajib diunggah." : "Foto selfie wajib diunggah.";
  }
  if (Object.keys(fileErrors).length) {
    throw new AppError("VALIDATION_ERROR", "Lengkapi dokumen verifikasi.", fileErrors, 400);
  }
  const id = newId();
  const rows = await query<ChangeRow>(
    `INSERT INTO organizer_change_requests (id, organizer_profile_id, base_version, name, contact_email, contact_phone, description,
       organizer_type, pic_name, city, reference_url, bank_name, bank_account_name, bank_account_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (organizer_profile_id) WHERE status = 'PENDING' DO NOTHING
     RETURNING ${CHANGE_SELECT}`,
    [id, profile.id, profile.version, in_.name, in_.email, in_.phone, in_.description, in_.type, in_.pic, in_.city,
      in_.referenceUrl, in_.bank.bankName, in_.bank.accountName, in_.bank.accountNumber],
  );
  const row = rows[0];
  if (!row) throw new AppError("ORGANIZER_CHANGE_PENDING", "Masih ada perubahan yang menunggu persetujuan admin.", {}, 409);
  try {
    if (files.ktp?.length) await saveChangeDocument(id, "KTP", files.ktp);
    if (files.selfie?.length) await saveChangeDocument(id, "SELFIE", files.selfie);
  } catch (err) {
    // No multi-statement transaction on the HTTP driver: undo so the owner can retry cleanly.
    await deleteChangeDocuments(id).catch(() => undefined);
    await execute(`DELETE FROM organizer_change_requests WHERE id=$1 AND status='PENDING'`, [id]).catch(() => 0);
    throw err;
  }
  await appendHistory({ profileId: profile.id, actor: "OWNER", type: "CHANGE_REQUESTED", fromStatus: "APPROVED", toStatus: "APPROVED" });
  await notifyAdmins({
    type: "MODERATION_NEEDED",
    title: "Perubahan data penyelenggara",
    body: `${profile.name} mengajukan perubahan data verifikasi. Tinjau sebelum diterapkan.`,
    actionPath: `/admin/organizers/${profile.id}`,
    entityType: "OrganizerProfile",
    entityId: profile.id,
    deduplicationKey: `org-change:${id}`,
    domainEventId: `org-change:${id}`,
  });
  return row;
}

export async function cancelChange(actor: AuthUser): Promise<void> {
  const profile = await getByOwner(actor.id);
  if (!profile) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  const pending = await getPendingChange(profile.id);
  if (!pending) throw new AppError("NOT_FOUND", "Tidak ada perubahan yang menunggu.", {}, 404);
  const n = await execute(
    `UPDATE organizer_change_requests SET status='CANCELLED', decided_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='PENDING'`,
    [pending.id],
  );
  if (!n) throw new AppError("ORGANIZER_CHANGE_CONFLICT", "Perubahan sudah diputuskan admin.", {}, 409);
  await deleteChangeDocuments(pending.id);
  await appendHistory({ profileId: profile.id, actor: "OWNER", type: "CHANGE_CANCELLED", fromStatus: "APPROVED", toStatus: "APPROVED" });
}

/** Copies the approved proposal onto the live profile. Every step is idempotent so a retry after a crash is safe. */
async function applyChange(c: ChangeRow, profile: OrganizerProfile): Promise<void> {
  await execute(
    `UPDATE organizer_profiles SET name=$2, contact_email=$3, contact_phone=$4, description=$5, organizer_type=$6, pic_name=$7,
            city=$8, reference_url=$9, bank_name=$10, bank_account_name=$11, bank_account_number=$12,
            data_consent_at=$13::timestamptz, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$1`,
    [profile.id, c.name, c.contact_email, c.contact_phone, c.description, c.organizer_type, c.pic_name, c.city, c.reference_url,
      c.bank_name, c.bank_account_name, c.bank_account_number, c.data_consent_at],
  );
  for (const kind of DOCUMENT_KINDS) {
    const exists = await query<{ id: string }>(
      `SELECT id FROM organizer_change_request_documents WHERE change_request_id=$1 AND kind=$2`,
      [c.id, kind],
    );
    if (!exists[0]) continue;
    const doc = await readChangeDocument(c.id, kind);
    await saveDocument(profile.id, kind, doc.bytes); // re-sealed with the live profile's AAD
  }
}

export async function decideChange(admin: AuthUser, requestId: string, decision: string, reason: string) {
  const action = decision.trim().toUpperCase();
  if (action !== "APPROVE" && action !== "REJECT") {
    throw new AppError("VALIDATION_ERROR", "Keputusan tidak valid.", { decision: "Pilih setujui atau tolak." }, 400);
  }
  const r = reason.trim();
  if ([...r].length < 10 || [...r].length > 1000) {
    throw new AppError("ORGANIZER_REASON_REQUIRED", "Alasan keputusan wajib 10–1000 karakter.", {}, 400);
  }
  const c = await getChangeById(requestId);
  if (!c) throw new AppError("NOT_FOUND", "Permintaan perubahan tidak ditemukan.", {}, 404);
  if (c.status !== "PENDING") throw new AppError("ORGANIZER_CHANGE_CONFLICT", "Perubahan sudah diputuskan.", {}, 409);
  const profile = await getById(c.organizer_profile_id);
  if (!profile) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  if (action === "APPROVE") {
    if (profile.status !== "APPROVED") {
      throw new AppError("ORGANIZER_CHANGE_NOT_ALLOWED", "Profil tidak lagi berstatus disetujui.", {}, 409);
    }
    await applyChange(c, profile);
  }
  const next = action === "APPROVE" ? "APPROVED" : "REJECTED";
  // Single conditional update decides the winner when two admins act at once.
  const n = await execute(
    `UPDATE organizer_change_requests SET status=$2, decided_at=CURRENT_TIMESTAMP, decided_by_user_id=$3, decision_reason=$4
     WHERE id=$1 AND status='PENDING'`,
    [requestId, next, admin.id, r],
  );
  if (!n) throw new AppError("ORGANIZER_CHANGE_CONFLICT", "Perubahan sudah diputuskan.", {}, 409);
  if (action === "APPROVE") await deleteChangeDocuments(requestId);
  await appendHistory({
    profileId: profile.id,
    actor: "ADMIN",
    type: action === "APPROVE" ? "CHANGE_APPROVED" : "CHANGE_REJECTED",
    fromStatus: "APPROVED",
    toStatus: "APPROVED",
    note: r,
  });
  await notify({
    recipientUserId: profile.owner_user_id,
    type: action === "APPROVE" ? "ORGANIZER_APPROVED" : "ORGANIZER_REJECTED",
    title: action === "APPROVE" ? "Perubahan data disetujui" : "Perubahan data ditolak",
    body: action === "APPROVE" ? "Data penyelenggara Anda sudah diperbarui." : `Alasan admin: ${r.slice(0, 400)}`,
    actionPath: "/dashboard/profile#penyelenggara",
    entityType: "OrganizerProfile",
    entityId: profile.id,
    deduplicationKey: `org-change-decision:${requestId}`,
    domainEventId: `org-change-decision:${requestId}`,
  });
  return { status: next };
}

/** Admin reads are audited like the original application documents. */
export async function readChangeDocumentAsAdmin(adminId: string, requestId: string, kind: DocumentKind, correlationId: string) {
  const file = await readChangeDocument(requestId, kind);
  await execute(
    `INSERT INTO audit_logs (id, actor_type, actor_user_id, action, entity_type, entity_id, outcome, correlation_id, metadata)
     VALUES ($1,'USER',$2,'organizer.change_document.view','OrganizerChangeRequest',$3,'SUCCESS',$4,$5::jsonb)`,
    [newId(), adminId, requestId, correlationId, JSON.stringify({ kind })],
  );
  return file;
}

/** Documents of rejected or cancelled requests are kept briefly, then deleted. */
export async function purgeChangeDocuments(days = REJECTED_RETENTION_DAYS): Promise<{ documents: number }> {
  const rows = await query<{ id: string }>(
    `DELETE FROM organizer_change_request_documents d
     USING organizer_change_requests c
     WHERE d.change_request_id = c.id AND c.status IN ('REJECTED','CANCELLED','APPROVED')
       AND c.decided_at IS NOT NULL AND c.decided_at < CURRENT_TIMESTAMP - make_interval(days => $1::int)
     RETURNING d.id`,
    [days],
  );
  return { documents: rows.length };
}
