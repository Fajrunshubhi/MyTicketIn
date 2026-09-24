import { AppError, execute, newId, query } from "@/lib/server/http";
import { getOwnedEvent } from "@/lib/server/events-organizer";

async function organizerOwnerId(profileId: string): Promise<string> {
  const rows = await query<{ owner_user_id: string }>(
    `SELECT owner_user_id FROM organizer_profiles WHERE id = $1 LIMIT 1`,
    [profileId],
  );
  const id = rows[0]?.owner_user_id;
  if (!id) throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
  return id;
}

export async function listStaff(orgId: string, eventId: string) {
  await getOwnedEvent(orgId, eventId);
  const rows = await query<{
    id: string;
    display_name: string;
    username: string;
    status: string;
    version: number;
  }>(
    `SELECT a.id, u.name AS display_name, COALESCE(s.username, u.username) AS username, a.status::text AS status, a.version
     FROM event_staff_assignments a
     JOIN users u ON u.id=a.user_id
     LEFT JOIN organizer_staff_accounts s ON s.user_id = a.user_id
     WHERE a.event_id=$1
     ORDER BY a.assigned_at DESC, a.id DESC`,
    [eventId],
  );
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    username: r.username,
    status: r.status,
    version: r.version,
  }));
}

export async function searchStaffCandidates(orgId: string, q: string) {
  const ownerId = await organizerOwnerId(orgId);
  const term = q.trim().toLowerCase();
  const rows = await query<{ id: string; name: string; username: string }>(
    `SELECT s.user_id AS id, u.name, s.username
     FROM organizer_staff_accounts s
     JOIN users u ON u.id = s.user_id
     WHERE s.organizer_user_id = $1 AND s.status = 'ACTIVE'
       AND ($2 = '' OR s.username LIKE $3 OR lower(u.name) LIKE $3)
     ORDER BY u.name ASC, s.username ASC
     LIMIT 50`,
    [ownerId, term, `%${term}%`],
  );
  return rows.map((r) => ({ id: r.id, displayName: r.name, username: r.username }));
}

export async function assignStaff(orgId: string, eventId: string, actorId: string, userId: string) {
  await getOwnedEvent(orgId, eventId);
  const ownerId = await organizerOwnerId(orgId);
  const staff = await query<{ user_id: string }>(
    `SELECT user_id FROM organizer_staff_accounts
     WHERE organizer_user_id = $1 AND user_id = $2 AND status = 'ACTIVE'
     LIMIT 1`,
    [ownerId, userId],
  );
  if (!staff[0]) {
    throw new AppError("FORBIDDEN", "Hanya akun petugas milik penyelenggara ini yang dapat ditugaskan.", {}, 403);
  }
  const existing = await query<{ id: string; status: string; version: number }>(
    `SELECT id, status::text AS status, version FROM event_staff_assignments WHERE event_id=$1 AND user_id=$2 LIMIT 1`,
    [eventId, userId],
  );
  if (existing[0]?.status === "ACTIVE") throw new AppError("CONFLICT", "Petugas sudah ditugaskan.", {}, 409);
  if (existing[0]) {
    await execute(
      `UPDATE event_staff_assignments SET status='ACTIVE'::event_staff_assignment_status, assigned_by_user_id=$1, assigned_at=CURRENT_TIMESTAMP,
              revoked_at=NULL, revoked_by_user_id=NULL, revocation_reason=NULL, updated_at=CURRENT_TIMESTAMP, version=version+1
       WHERE id=$2`,
      [actorId, existing[0].id],
    );
  } else {
    await execute(
      `INSERT INTO event_staff_assignments (id,event_id,user_id,status,assigned_by_user_id,assigned_at,created_at,updated_at,version)
       VALUES ($1,$2,$3,'ACTIVE'::event_staff_assignment_status,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)`,
      [newId(), eventId, userId, actorId],
    );
  }
  const items = await listStaff(orgId, eventId);
  return items.find((item) => item.status === "ACTIVE") || items[0];
}

export async function revokeStaff(orgId: string, eventId: string, assignmentId: string, actorId: string, reason: string, expectedVersion: number) {
  await getOwnedEvent(orgId, eventId);
  const why = reason.trim();
  if (why.length < 10) throw new AppError("VALIDATION_ERROR", "Alasan pencabutan wajib minimal 10 karakter.", {}, 400);
  const n = await execute(
    `UPDATE event_staff_assignments SET status='REVOKED'::event_staff_assignment_status, revoked_by_user_id=$1, revoked_at=CURRENT_TIMESTAMP,
            revocation_reason=$2, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$3 AND event_id=$4 AND version=$5 AND status='ACTIVE'`,
    [actorId, why, assignmentId, eventId, expectedVersion],
  );
  if (!n) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
}
