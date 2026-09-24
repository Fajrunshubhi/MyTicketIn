import { AppError, newId, query, tokenHash } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { lookupTicketByToken, markUsed } from "@/lib/server/tickets";

export async function scannerAccess(user: AuthUser, eventId: string) {
  const allowed = await canScan(user, eventId);
  if (!allowed) throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
  const ev = await query<{
    id: string;
    title: string;
    status: string;
    starts_at: string;
    timezone: string;
    venue_name: string;
  }>(
    `SELECT id, title, status::text AS status, starts_at::text, timezone, venue_name FROM events WHERE id=$1 LIMIT 1`,
    [eventId],
  );
  if (!ev[0]) throw new AppError("NOT_FOUND", "Event tidak ditemukan.", {}, 404);
  return {
    event: {
      id: ev[0].id,
      title: ev[0].title,
      startsAt: ev[0].starts_at,
      timezone: ev[0].timezone,
      venueName: ev[0].venue_name,
    },
    permissions: { scan: true, manualEntry: true },
  };
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

function ticketHolder(ticket: Record<string, unknown> | null) {
  if (!ticket) return null;
  const nik = String(ticket.holder_identity_number || "");
  return {
    fullName: String(ticket.holder_full_name || ticket.owner_name || ""),
    email: String(ticket.holder_email || ""),
    phone: String(ticket.holder_phone || ""),
    identityNumber: nik === "0000000000000000" ? "" : nik,
    ownerName: String(ticket.owner_name || ""),
  };
}

const RESULT_MESSAGE: Record<string, string> = {
  VALID: "Check-in berhasil.",
  ALREADY_USED: "Anda sudah check-in. Tiket sudah digunakan.",
  INVALID: "Tiket tidak valid.",
  CANCELLED: "Tiket dibatalkan.",
  WRONG_EVENT: "Tiket ini bukan untuk event yang sedang dipindai.",
};

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
      try {
        await markUsed(String(ticket.id), user.id);
        result = "VALID";
        reason = "OK";
      } catch (err) {
        if (err instanceof AppError && err.code === "CHECK_IN_ALREADY_USED") {
          result = "ALREADY_USED";
          reason = "ALREADY_USED";
        } else {
          throw err;
        }
      }
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
    message: RESULT_MESSAGE[result] || RESULT_MESSAGE.INVALID,
    ticket: ticket
      ? {
          id: ticket.id,
          ticketNumber: ticket.ticket_number,
          ticketTypeName: ticket.ticket_type_name,
          sectionName: ticket.section_name,
          seatLabel: ticket.seat_label,
          holder: ticketHolder(ticket),
        }
      : null,
  };
}

export async function listAttempts(user: AuthUser, eventId: string, limit: number) {
  if (!(await canScan(user, eventId))) throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
  const rows = await query<{
    id: string;
    result: string;
    reason_code: string;
    attempted_at: string;
    first_used_at: string | null;
    input_type: string;
    ticket_number: string;
    operator_name: string;
    holder_full_name: string;
    holder_email: string;
    holder_phone: string;
    holder_identity_number: string;
    owner_name: string;
  }>(
    `SELECT a.id, a.result::text AS result, a.reason_code, a.attempted_at::text, a.first_used_at::text,
            a.input_type::text AS input_type, COALESCE(t.ticket_number,'') AS ticket_number,
            COALESCE(op.name, 'Petugas') AS operator_name,
            COALESCE(NULLIF(btrim(t.holder_full_name), ''), att.full_name, own.name, '') AS holder_full_name,
            COALESCE(NULLIF(btrim(t.holder_email), ''), att.email, own.email, '') AS holder_email,
            COALESCE(NULLIF(btrim(t.holder_phone), ''), att.phone, '') AS holder_phone,
            COALESCE(NULLIF(t.holder_identity_number, '0000000000000000'), att.identity_number, '') AS holder_identity_number,
            COALESCE(own.name, '') AS owner_name
     FROM check_in_attempts a
     LEFT JOIN tickets t ON t.id = a.ticket_id
     LEFT JOIN users op ON op.id = a.operator_user_id
     LEFT JOIN users own ON own.id = t.owner_user_id
     LEFT JOIN order_attendees att ON att.order_item_id = t.order_item_id AND att.unit_sequence = t.unit_sequence
     WHERE a.event_id=$1
     ORDER BY a.attempted_at DESC, a.id DESC
     LIMIT $2`,
    [eventId, Math.min(Math.max(limit || 50, 1), 100)],
  );
  return rows.map((r) => ({
    id: r.id,
    result: r.result,
    reasonCode: r.reason_code,
    attemptedAt: r.attempted_at,
    firstUsedAt: r.first_used_at || undefined,
    inputType: r.input_type,
    ticketNumberMasked: maskTicketNumber(r.ticket_number),
    operatorName: r.operator_name,
    holder: r.ticket_number
      ? {
          fullName: r.holder_full_name,
          email: r.holder_email,
          phone: r.holder_phone,
          identityNumber: r.holder_identity_number === "0000000000000000" ? "" : r.holder_identity_number,
          ownerName: r.owner_name,
        }
      : null,
  }));
}

function maskTicketNumber(raw: string): string {
  const n = raw.trim();
  if (n.length < 4) return "";
  if (n.length <= 6) return `${n.slice(0, 2)}••${n.slice(-1)}`;
  return `${n.slice(0, 3)}••••${n.slice(-3)}`;
}
