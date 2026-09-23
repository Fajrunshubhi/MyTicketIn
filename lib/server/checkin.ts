import { AppError, newId, query, tokenHash } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { lookupTicketByToken, markUsed } from "@/lib/server/tickets";

export async function scannerAccess(user: AuthUser, eventId: string) {
  const allowed = await canScan(user, eventId);
  if (!allowed) throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
  const ev = await query<{ id: string; title: string; status: string }>(
    `SELECT id, title, status::text AS status FROM events WHERE id=$1 LIMIT 1`,
    [eventId],
  );
  if (!ev[0]) throw new AppError("NOT_FOUND", "Event tidak ditemukan.", {}, 404);
  return { eventId: ev[0].id, title: ev[0].title, canScan: true };
}

async function canScan(user: AuthUser, eventId: string): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const org = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM events e
     JOIN organizer_profiles p ON p.id = e.organizer_profile_id
     WHERE e.id=$1 AND p.owner_user_id=$2 AND p.status='APPROVED'`,
    [eventId, user.id],
  );
  if (Number(org[0]?.n || 0) > 0) return true;
  const staff = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM event_staff_assignments
     WHERE event_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [eventId, user.id],
  );
  return Number(staff[0]?.n || 0) > 0;
}

export async function checkIn(
  user: AuthUser,
  eventId: string,
  input: { inputType?: string; value?: string },
  idemKey: string,
) {
  if (!(await canScan(user, eventId))) throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
  const started = Date.now();
  const raw = String(input.value || "").trim();
  const type = String(input.inputType || "QR").toUpperCase();
  const ticket = await lookupTicketByToken(raw);
  let result = "INVALID";
  let reason = "TICKET_NOT_FOUND";
  let ticketId: string | null = null;
  if (ticket && ticket.event_id !== eventId) {
    ticketId = String(ticket.id);
    result = "WRONG_EVENT";
    reason = "WRONG_EVENT";
  } else if (ticket && ticket.event_id === eventId) {
    ticketId = String(ticket.id);
    if (ticket.status === "USED") {
      result = "ALREADY_USED";
      reason = "ALREADY_USED";
    } else if (ticket.status === "UNUSED") {
      await markUsed(String(ticket.id), user.id);
      result = "VALID";
      reason = "OK";
    } else {
      result = "CANCELLED";
      reason = "TICKET_CANCELLED";
    }
  }
  const attemptId = newId();
  await query(
    `INSERT INTO check_in_attempts (
       id, event_id, ticket_id, operator_user_id, input_type, result, reason_code, attempted_at, first_used_at,
       input_fingerprint, idempotency_key_hash, request_hash, correlation_id, duration_ms, client_context
     ) VALUES (
       $1,$2,$3,$4,$5::check_in_input_type,$6::check_in_result,$7,CURRENT_TIMESTAMP,$8,
       $9,$10,$11,$12,$13,'{}'::jsonb
     )`,
    [
      attemptId,
      eventId,
      ticketId,
      user.id,
      type === "MANUAL" || type === "MANUAL_CODE" ? "MANUAL_CODE" : "QR_TOKEN",
      result,
      reason,
      result === "VALID" || result === "ALREADY_USED" ? new Date().toISOString() : null,
      tokenHash(raw),
      tokenHash(idemKey || attemptId),
      tokenHash(`${eventId}|${raw}`),
      `req_${attemptId}`,
      Date.now() - started,
    ],
  );
  return {
    result,
    reasonCode: reason,
    ticket: ticket
      ? {
          id: ticket.id,
          ticketNumber: ticket.ticket_number,
          ticketTypeName: ticket.ticket_type_name,
          sectionName: ticket.section_name,
          seatLabel: ticket.seat_label,
        }
      : null,
  };
}

export async function listAttempts(user: AuthUser, eventId: string, limit: number) {
  if (!(await canScan(user, eventId))) throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
  return query<Record<string, unknown>>(
    `SELECT a.id, a.result::text AS result, a.reason_code, a.attempted_at::text, a.input_type::text AS input_type,
            COALESCE(t.ticket_number,'') AS ticket_number
     FROM check_in_attempts a LEFT JOIN tickets t ON t.id=a.ticket_id
     WHERE a.event_id=$1 ORDER BY a.attempted_at DESC, a.id DESC LIMIT $2`,
    [eventId, Math.min(Math.max(limit || 50, 1), 100)],
  );
}
