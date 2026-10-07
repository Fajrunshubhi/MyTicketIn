import { AppError, execute, newId, query } from "@/lib/server/http";
import { inspectImageBytes } from "@/lib/server/gallery";
import { asBuffer } from "@/lib/server/tickets";
import { openDocument, sealDocument } from "@/lib/server/document-crypto";

export type DocumentKind = "KTP" | "SELFIE";
export const DOCUMENT_KINDS: DocumentKind[] = ["KTP", "SELFIE"];
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
/** Rejected applications keep their documents this long, so the owner can still fix and resubmit. */
export const REJECTED_RETENTION_DAYS = 30;

export function parseDocumentKind(raw: string): DocumentKind {
  const kind = String(raw || "").toUpperCase();
  if (kind === "KTP" || kind === "SELFIE") return kind;
  throw new AppError("NOT_FOUND", "Dokumen tidak ditemukan.", {}, 404);
}

const LABEL: Record<DocumentKind, string> = { KTP: "Foto KTP", SELFIE: "Foto selfie" };

/** Validates by magic bytes (not the client MIME type) and returns what will be stored. */
export function validateDocument(kind: DocumentKind, bytes: Buffer): { mime: string } {
  if (!bytes.length) {
    throw new AppError("VALIDATION_ERROR", `${LABEL[kind]} wajib diunggah.`, { [fieldFor(kind)]: `${LABEL[kind]} wajib diunggah.` }, 400);
  }
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new AppError("VALIDATION_ERROR", `${LABEL[kind]} maksimal 5 MB.`, { [fieldFor(kind)]: "Ukuran maksimal 5 MB." }, 400);
  }
  try {
    const { mime } = inspectImageBytes(bytes);
    return { mime };
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      `${LABEL[kind]} harus berupa gambar JPG, PNG, atau WebP.`,
      { [fieldFor(kind)]: "Gunakan gambar JPG, PNG, atau WebP." },
      400,
    );
  }
}

export function fieldFor(kind: DocumentKind): string {
  return kind === "KTP" ? "ktp" : "selfie";
}

const aadFor = (profileId: string, kind: DocumentKind) => `organizer-doc:${profileId}:${kind}`;

export async function saveDocument(profileId: string, kind: DocumentKind, bytes: Buffer): Promise<void> {
  const { mime } = validateDocument(kind, bytes);
  const sealed = sealDocument(bytes, aadFor(profileId, kind));
  await execute(
    `INSERT INTO organizer_verification_documents (id, organizer_profile_id, kind, mime_type, byte_size, nonce, auth_tag, ciphertext)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (organizer_profile_id, kind) DO UPDATE
       SET mime_type=EXCLUDED.mime_type, byte_size=EXCLUDED.byte_size, nonce=EXCLUDED.nonce,
           auth_tag=EXCLUDED.auth_tag, ciphertext=EXCLUDED.ciphertext, updated_at=CURRENT_TIMESTAMP`,
    [newId(), profileId, kind, mime, bytes.length, sealed.nonce, sealed.tag, sealed.ciphertext],
  );
}

export async function readDocument(profileId: string, kind: DocumentKind): Promise<{ bytes: Buffer; mime: string }> {
  const rows = await query<{ mime_type: string; nonce: unknown; auth_tag: unknown; ciphertext: unknown }>(
    `SELECT mime_type, nonce, auth_tag, ciphertext FROM organizer_verification_documents
     WHERE organizer_profile_id=$1 AND kind=$2 LIMIT 1`,
    [profileId, kind],
  );
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Dokumen tidak ditemukan.", {}, 404);
  try {
    const bytes = openDocument(
      { nonce: asBuffer(row.nonce), tag: asBuffer(row.auth_tag), ciphertext: asBuffer(row.ciphertext) },
      aadFor(profileId, kind),
    );
    return { bytes, mime: row.mime_type };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("INTERNAL_ERROR", "Dokumen tidak dapat dibuka.", {}, 500);
  }
}

export async function documentFlags(profileId: string): Promise<{ hasKtp: boolean; hasSelfie: boolean }> {
  const rows = await query<{ kind: string }>(
    `SELECT kind FROM organizer_verification_documents WHERE organizer_profile_id=$1`,
    [profileId],
  );
  return { hasKtp: rows.some((r) => r.kind === "KTP"), hasSelfie: rows.some((r) => r.kind === "SELFIE") };
}

export async function deleteDocuments(profileId: string): Promise<number> {
  return execute(`DELETE FROM organizer_verification_documents WHERE organizer_profile_id=$1`, [profileId]);
}

/** Admin read is always audited (who, which profile, which kind) without storing the image itself. */
export async function readDocumentAsAdmin(adminId: string, profileId: string, kind: DocumentKind, correlationId: string) {
  const file = await readDocument(profileId, kind);
  await execute(
    `INSERT INTO audit_logs (id, actor_type, actor_user_id, action, entity_type, entity_id, outcome, correlation_id, metadata)
     VALUES ($1,'USER',$2,'organizer.document.view','OrganizerProfile',$3,'SUCCESS',$4,$5::jsonb)`,
    [newId(), adminId, profileId, correlationId, JSON.stringify({ kind })],
  );
  return file;
}

/** Retention: documents of finally-rejected applications are deleted after REJECTED_RETENTION_DAYS. */
export async function purgeRejectedDocuments(days = REJECTED_RETENTION_DAYS): Promise<{ profiles: number; documents: number }> {
  const rows = await query<{ organizer_profile_id: string }>(
    `DELETE FROM organizer_verification_documents d
     USING organizer_profiles p
     WHERE d.organizer_profile_id = p.id
       AND p.status = 'REJECTED'::organizer_status
       AND p.decided_at IS NOT NULL
       AND p.decided_at < CURRENT_TIMESTAMP - make_interval(days => $1::int)
     RETURNING d.organizer_profile_id`,
    [days],
  );
  return { profiles: new Set(rows.map((r) => r.organizer_profile_id)).size, documents: rows.length };
}
