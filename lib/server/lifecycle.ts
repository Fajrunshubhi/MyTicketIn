import { AppError, execute, newId, query } from "@/lib/server/http";
import { getOwnedEvent, markEventCancelled } from "@/lib/server/events-organizer";

const LIFE_COLS = `r.id, r.event_id, r.ticket_type_id, r.kind, r.status, r.reason, e.title AS event_title,
  COALESCE(p.name,'') AS organizer_name, COALESCE(t.name,'') AS ticket_type_name`;

export type LifeRow = {
  id: string;
  event_id: string;
  ticket_type_id: string | null;
  kind: string;
  status: string;
  reason: string;
  event_title: string;
  organizer_name: string;
  ticket_type_name: string;
};

export function lifeDto(r: LifeRow) {
  return {
    id: r.id,
    eventId: r.event_id,
    ticketTypeId: r.ticket_type_id,
    kind: r.kind,
    status: r.status,
    reason: r.reason,
    eventTitle: r.event_title,
    organizerName: r.organizer_name,
    ticketTypeName: r.ticket_type_name || undefined,
  };
}

export async function listPendingLifecycle() {
  return query<LifeRow>(
    `SELECT ${LIFE_COLS} FROM event_lifecycle_requests r
     JOIN events e ON e.id=r.event_id
     LEFT JOIN organizer_profiles p ON p.id=e.organizer_profile_id
     LEFT JOIN event_ticket_types t ON t.id=r.ticket_type_id
     WHERE r.status='PENDING' ORDER BY r.requested_at ASC, r.id ASC`,
  );
}

export async function listEventLifecycle(eventId: string) {
  return query<LifeRow>(
    `SELECT ${LIFE_COLS} FROM event_lifecycle_requests r
     JOIN events e ON e.id=r.event_id
     LEFT JOIN organizer_profiles p ON p.id=e.organizer_profile_id
     LEFT JOIN event_ticket_types t ON t.id=r.ticket_type_id
     WHERE r.event_id=$1 ORDER BY r.requested_at DESC, r.id DESC`,
    [eventId],
  );
}

export async function requestCancel(orgId: string, eventId: string, userId: string, reason: string) {
  const why = reason.trim();
  if (why.length < 10) throw new AppError("VALIDATION_ERROR", "Alasan wajib minimal 10 karakter.", {}, 400);
  const e = await getOwnedEvent(orgId, eventId);
  if (!["PUBLISHED", "PENDING_REVIEW"].includes(e.status)) {
    throw new AppError("EVENT_STATUS_INVALID", "Event tidak dapat dibatalkan.", {}, 409);
  }
  const id = newId();
  await execute(
    `INSERT INTO event_lifecycle_requests (id,event_id,ticket_type_id,kind,status,reason,requested_by_user_id,requested_at,created_at,updated_at,version)
     VALUES ($1,$2,NULL,'CANCEL_EVENT','PENDING',$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)`,
    [id, eventId, why, userId],
  );
  const rows = await listEventLifecycle(eventId);
  return rows.find((r) => r.id === id)!;
}

export async function requestStopSales(orgId: string, eventId: string, ticketId: string, userId: string, reason: string) {
  const why = reason.trim();
  if (why.length < 10) throw new AppError("VALIDATION_ERROR", "Alasan wajib minimal 10 karakter.", {}, 400);
  await getOwnedEvent(orgId, eventId);
  const tickets = await query<{ id: string; sales_stopped_at: string | null }>(
    `SELECT id, sales_stopped_at::text FROM event_ticket_types WHERE event_id=$1 AND id=$2`,
    [eventId, ticketId],
  );
  if (!tickets[0]) throw new AppError("NOT_FOUND", "Tiket tidak ditemukan.", {}, 404);
  if (tickets[0].sales_stopped_at) throw new AppError("EVENT_STATUS_INVALID", "Penjualan sudah dihentikan.", {}, 409);
  const id = newId();
  await execute(
    `INSERT INTO event_lifecycle_requests (id,event_id,ticket_type_id,kind,status,reason,requested_by_user_id,requested_at,created_at,updated_at,version)
     VALUES ($1,$2,$3,'STOP_SALES','PENDING',$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)`,
    [id, eventId, ticketId, why, userId],
  );
  const rows = await listEventLifecycle(eventId);
  return rows.find((r) => r.id === id)!;
}

export async function decideLifecycle(adminId: string, requestId: string, decision: string, decisionReason: string) {
  const d = decision.trim().toUpperCase();
  if (d !== "APPROVE" && d !== "REJECT") throw new AppError("VALIDATION_ERROR", "Keputusan tidak valid.", {}, 400);
  if (d === "REJECT" && decisionReason.trim().length < 10) {
    throw new AppError("VALIDATION_ERROR", "Alasan penolakan wajib minimal 10 karakter.", {}, 400);
  }
  const rows = await query<LifeRow & { version: number }>(
    `SELECT ${LIFE_COLS}, r.version FROM event_lifecycle_requests r
     JOIN events e ON e.id=r.event_id
     LEFT JOIN organizer_profiles p ON p.id=e.organizer_profile_id
     LEFT JOIN event_ticket_types t ON t.id=r.ticket_type_id
     WHERE r.id=$1 LIMIT 1`,
    [requestId],
  );
  const req = rows[0];
  if (!req) throw new AppError("NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  if (req.status !== "PENDING") throw new AppError("EVENT_STATUS_INVALID", "Pengajuan sudah diputuskan.", {}, 409);
  if (d === "APPROVE") {
    if (req.kind === "CANCEL_EVENT") {
      await markEventCancelled(req.event_id, adminId, req.reason);
    } else if (req.ticket_type_id) {
      await execute(
        `UPDATE event_ticket_types SET sales_stopped_at=CURRENT_TIMESTAMP, sales_stopped_by_user_id=$1, sales_stop_reason=$2,
                updated_at=CURRENT_TIMESTAMP, version=version+1
         WHERE id=$3 AND event_id=$4 AND sales_stopped_at IS NULL`,
        [adminId, req.reason, req.ticket_type_id, req.event_id],
      );
    }
  }
  const status = d === "APPROVE" ? "APPROVED" : "REJECTED";
  const n = await execute(
    `UPDATE event_lifecycle_requests SET status=$1, decided_by_user_id=$2, decided_at=CURRENT_TIMESTAMP,
            decision_reason=$3, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$4 AND status='PENDING'`,
    [status, adminId, d === "REJECT" ? decisionReason.trim() : null, requestId],
  );
  if (!n) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  const next = await query<LifeRow>(
    `SELECT ${LIFE_COLS} FROM event_lifecycle_requests r
     JOIN events e ON e.id=r.event_id
     LEFT JOIN organizer_profiles p ON p.id=e.organizer_profile_id
     LEFT JOIN event_ticket_types t ON t.id=r.ticket_type_id
     WHERE r.id=$1`,
    [requestId],
  );
  return next[0];
}
