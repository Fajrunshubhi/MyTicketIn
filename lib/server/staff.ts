import { AppError, execute, newId, query } from "@/lib/server/http";
import { getOwnedEvent } from "@/lib/server/events-organizer";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 2);
  return `${head}•••@${domain}`;
}

export async function listStaff(orgId: string, eventId: string) {
  await getOwnedEvent(orgId, eventId);
  const rows = await query<{
    id: string;
    display_name: string;
    email: string;
    status: string;
    version: number;
  }>(
    `SELECT a.id, u.name AS display_name, u.email, a.status::text AS status, a.version
     FROM event_staff_assignments a
     JOIN users u ON u.id=a.user_id
     WHERE a.event_id=$1
     ORDER BY a.assigned_at DESC, a.id DESC`,
    [eventId],
  );
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    maskedEmail: maskEmail(r.email),
    status: r.status,
    version: r.version,
  }));
}

export async function searchStaffCandidates(q: string) {
  const term = q.trim().toLowerCase();
  if ([...term].length < 3) throw new AppError("NOT_FOUND", "Pengguna tidak ditemukan.", {}, 404);
  const rows = await query<{ id: string; name: string; email: string }>(
    `SELECT id, name, email FROM users
     WHERE status='ACTIVE' AND role='USER'
       AND (lower(name) LIKE $1 OR username LIKE $1 OR email LIKE $1)
     ORDER BY name ASC, id ASC LIMIT 20`,
    [`%${term}%`],
  );
  return rows.map((r) => ({ id: r.id, displayName: r.name, maskedEmail: maskEmail(r.email) }));
}

export async function assignStaff(orgId: string, eventId: string, actorId: string, userId: string) {
  await getOwnedEvent(orgId, eventId);
  const users = await query<{ id: string; role: string; status: string }>(
    `SELECT id, role::text AS role, status::text AS status FROM users WHERE id=$1 LIMIT 1`,
    [userId],
  );
  const u = users[0];
  if (!u) throw new AppError("NOT_FOUND", "Pengguna tidak ditemukan.", {}, 404);
  if (u.role === "ADMIN") throw new AppError("FORBIDDEN", "Admin tidak dapat ditugaskan sebagai petugas.", {}, 403);
  if (u.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Pengguna tidak aktif.", {}, 403);
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
  return items[0];
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
