import { execute, newId, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import {
  emailRetryDelayMinutes,
  isEmailNotificationType,
  isNotificationType,
  MAX_EMAIL_ATTEMPTS,
  resolveNotificationActionPath,
  type NotificationType,
} from "@/lib/server/notification-types";
import { notificationEmail, sendMail, type MailAttachment } from "@/lib/server/mail";

export type { NotificationType } from "@/lib/server/notification-types";
export { NOTIFICATION_TYPE_LABEL, isNotificationType } from "@/lib/server/notification-types";

export type NotifyInput = {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  actionPath?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  deduplicationKey: string;
  domainEventId: string;
};

function clip(value: string, max: number): string {
  const t = value.trim().replace(/\s+/g, " ");
  if ([...t].length <= max) return t;
  return [...t].slice(0, max).join("");
}

function safePath(path?: string | null): string | null {
  const p = String(path || "").trim();
  if (!p) return null;
  if (!p.startsWith("/") || p.startsWith("//") || p.includes("://")) return null;
  return p.slice(0, 500);
}

async function writeInbox(input: NotifyInput): Promise<void> {
  const recipient = String(input.recipientUserId || "").trim();
  if (!recipient || !isNotificationType(input.type)) return;
  const title = clip(input.title, 160);
  const body = clip(input.body, 1000);
  if (!title || !body) return;
  const dedup = clip(input.deduplicationKey, 180);
  const actionPath = safePath(input.actionPath);
  const entityType = input.entityType && input.entityId ? clip(input.entityType, 60) : null;
  const entityId = entityType ? String(input.entityId) : null;
  await execute(
    `INSERT INTO notifications (
       id, recipient_user_id, type, title, body, action_path, entity_type, entity_id, deduplication_key, metadata
     ) VALUES ($1,$2,$3::notification_type,$4,$5,$6,$7,$8,$9,'{}'::jsonb)
     ON CONFLICT (recipient_user_id, deduplication_key) DO NOTHING`,
    [newId(), recipient, input.type, title, body, actionPath, entityType, entityId, dedup],
  );
}

/** Sends the email right after the in-app write so delivery does not depend on a scheduler; failures are retried by the job. */
async function sendEmailNow(recipient: string, dedup: string, type: string): Promise<void> {
  if (!isEmailNotificationType(type)) return;
  try {
    const note = await query<{ id: string }>(`SELECT id FROM notifications WHERE recipient_user_id=$1 AND deduplication_key=$2 LIMIT 1`, [
      recipient,
      dedup,
    ]);
    const id = note[0]?.id;
    if (!id) return;
    await execute(
      `INSERT INTO notification_deliveries (id, notification_id, channel, status, template_key, provider)
       VALUES ($1,$2,'EMAIL'::notification_channel,'PENDING'::notification_delivery_status,$3,'smtp')
       ON CONFLICT (notification_id, channel) DO NOTHING`,
      [newId(), id, type.slice(0, 80)],
    );
    await deliverEmail(id);
  } catch {
    // Email is best effort and must never fail the primary transaction.
  }
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const recipient = String(input.recipientUserId || "").trim();
    if (!recipient || !isNotificationType(input.type)) return;
    const title = clip(input.title, 160);
    const body = clip(input.body, 1000);
    if (!title || !body) return;
    const dedup = clip(input.deduplicationKey, 180);
    const domainEventId = clip(input.domainEventId, 160);
    const actionPath = safePath(input.actionPath);
    await writeInbox(input);
    await sendEmailNow(recipient, dedup, input.type);
    await execute(
      `INSERT INTO notification_outbox (
         id, domain_event_id, recipient_user_id, notification_type, payload, status
       ) VALUES ($1,$2,$3,$4::notification_type,$5::jsonb,'PENDING'::outbox_status)
       ON CONFLICT (domain_event_id, recipient_user_id, notification_type) DO NOTHING`,
      [
        newId(),
        domainEventId,
        recipient,
        input.type,
        JSON.stringify({ title, body, actionPath, templateKey: input.type, deduplicationKey: dedup }),
      ],
    );
  } catch (err) {
    const code = err instanceof Error ? err.message.slice(0, 80) : "notify_failed";
    console.error("notification_enqueue_failed", code);
  }
}

export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  for (const item of inputs) await notify(item);
}

export async function listAdminUserIds(): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM users WHERE role='ADMIN' AND status='ACTIVE'::user_status ORDER BY id`,
    [],
  );
  return rows.map((r) => r.id);
}

export async function notifyAdmins(
  input: Omit<NotifyInput, "recipientUserId"> & { recipientUserId?: string },
): Promise<void> {
  const ids = await listAdminUserIds();
  for (const id of ids) {
    await notify({
      ...input,
      recipientUserId: id,
      deduplicationKey: `${input.deduplicationKey}:${id}`,
    });
  }
}

export async function listCatalogBuyerUserIds(excludeUserId?: string | null): Promise<string[]> {
  const exclude = String(excludeUserId || "").trim() || null;
  const rows = await query<{ id: string }>(
    `SELECT u.id
     FROM users u
     WHERE u.role = 'USER' AND u.status = 'ACTIVE'::user_status
       AND ($1::text IS NULL OR u.id <> $1)
       AND NOT EXISTS (
         SELECT 1 FROM organizer_staff_accounts s
         WHERE s.user_id = u.id AND s.status = 'ACTIVE'
       )
       AND NOT EXISTS (
         SELECT 1 FROM organizer_profiles p
         WHERE p.owner_user_id = u.id
           AND p.status IN ('APPROVED'::organizer_status, 'SUSPENDED'::organizer_status)
       )
     ORDER BY u.id`,
    [exclude],
  );
  return rows.map((r) => r.id);
}

export async function notifyCatalogBuyers(input: Omit<NotifyInput, "recipientUserId">): Promise<void> {
  const ids = await listCatalogBuyerUserIds();
  for (const id of ids) {
    await notify({
      ...input,
      recipientUserId: id,
      deduplicationKey: `${input.deduplicationKey}:${id}`,
    });
  }
}

export async function eventOwnerUserId(eventId: string): Promise<string | null> {
  const rows = await query<{ owner_user_id: string }>(
    `SELECT p.owner_user_id FROM events e JOIN organizer_profiles p ON p.id = e.organizer_profile_id WHERE e.id=$1 LIMIT 1`,
    [eventId],
  );
  return rows[0]?.owner_user_id || null;
}

export async function paidTicketBuyerIds(eventId: string): Promise<string[]> {
  const rows = await query<{ owner_user_id: string }>(
    `SELECT DISTINCT t.owner_user_id
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     WHERE t.event_id=$1 AND o.status='PAID' AND t.status <> 'CANCELLED'`,
    [eventId],
  );
  return rows.map((r) => r.owner_user_id);
}

function iso(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function listNotifications(user: AuthUser, opts: { filter?: string; limit?: number }) {
  const limit = Math.min(Math.max(opts.limit || 20, 1), 50);
  const unreadOnly = opts.filter === "unread";
  const items = await query<{
    id: string;
    type: string;
    title: string;
    body: string;
    action_path: string | null;
    entity_id: string | null;
    read_at: string | null;
    created_at: string;
  }>(
    `SELECT id, type::text AS type, title, body, action_path, entity_id, read_at::text, created_at::text
     FROM notifications
     WHERE recipient_user_id=$1 AND ($2::boolean = false OR read_at IS NULL)
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [user.id, unreadOnly, limit],
  );
  const count = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM notifications WHERE recipient_user_id=$1 AND read_at IS NULL`,
    [user.id],
  );
  return {
    items: items.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      actionPath: resolveNotificationActionPath(row.type, row.action_path, row.entity_id),
      createdAt: iso(row.created_at) || new Date().toISOString(),
      readAt: iso(row.read_at),
    })),
    unreadCount: Number(count[0]?.n || 0),
  };
}

export async function markAllRead(user: AuthUser) {
  const n = await execute(
    `UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE recipient_user_id=$1 AND read_at IS NULL`,
    [user.id],
  );
  return n;
}

export async function markRead(user: AuthUser, id: string) {
  await execute(`UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id=$1 AND recipient_user_id=$2`, [
    id,
    user.id,
  ]);
}

/** Sends the EMAIL delivery for one notification, recording status and bounded retry. Never logs body or addresses. */
export async function deliverEmail(notificationId: string): Promise<"sent" | "skipped" | "failed" | "gone"> {
  const claimed = await query<{ attempt_count: number }>(
    `UPDATE notification_deliveries SET status='PROCESSING'::notification_delivery_status, attempt_count=attempt_count+1, updated_at=CURRENT_TIMESTAMP
     WHERE notification_id=$1 AND channel='EMAIL'::notification_channel
       AND status IN ('PENDING'::notification_delivery_status,'FAILED'::notification_delivery_status)
       AND attempt_count < $2
     RETURNING attempt_count`,
    [notificationId, MAX_EMAIL_ATTEMPTS],
  );
  if (!claimed[0]) return "gone";
  const attempts = Number(claimed[0].attempt_count);
  const rows = await query<{
    title: string;
    body: string;
    action_path: string | null;
    type: string;
    entity_id: string | null;
    entity_type: string | null;
    recipient_user_id: string;
    name: string;
    email: string;
  }>(
    `SELECT n.title, n.body, n.action_path, n.type::text AS type, n.entity_id, n.entity_type, n.recipient_user_id, u.name, u.email
     FROM notifications n JOIN users u ON u.id=n.recipient_user_id WHERE n.id=$1 LIMIT 1`,
    [notificationId],
  );
  const n = rows[0];
  try {
    if (!n) throw new Error("NOTIFICATION_MISSING");
    const msg = notificationEmail({
      name: n.name,
      title: n.title,
      body: n.body,
      actionPath: resolveNotificationActionPath(n.type, n.action_path, n.entity_id),
    });
    // PDF attachments (receipt / e-ticket) for the buyer only. If building them fails, the notice is still sent without them.
    let attachments: MailAttachment[] = [];
    if (n.entity_type === "Order" && n.entity_id && (n.type === "PAYMENT_SUCCEEDED" || n.type === "TICKET_ISSUED")) {
      try {
        // Lazy import: orders/tickets import this module, so a static import would be circular.
        const { receiptAttachments, ticketAttachments } = await import("@/lib/server/email-attachments");
        attachments =
          n.type === "PAYMENT_SUCCEEDED"
            ? await receiptAttachments(n.entity_id, n.recipient_user_id)
            : await ticketAttachments(n.entity_id, n.recipient_user_id);
      } catch {
        attachments = [];
      }
    }
    const result = await sendMail({ to: n.email, ...msg, attachments });
    if (result === "skipped") {
      await execute(
        `UPDATE notification_deliveries SET status='SKIPPED'::notification_delivery_status, next_attempt_at=NULL, last_error_code='NO_PROVIDER', updated_at=CURRENT_TIMESTAMP
         WHERE notification_id=$1 AND channel='EMAIL'::notification_channel`,
        [notificationId],
      );
      return "skipped";
    }
    await execute(
      `UPDATE notification_deliveries SET status='SENT'::notification_delivery_status, sent_at=CURRENT_TIMESTAMP, next_attempt_at=NULL, last_error_code=NULL, updated_at=CURRENT_TIMESTAMP
       WHERE notification_id=$1 AND channel='EMAIL'::notification_channel`,
      [notificationId],
    );
    return "sent";
  } catch {
    const delay = emailRetryDelayMinutes(attempts);
    await execute(
      `UPDATE notification_deliveries SET status='FAILED'::notification_delivery_status, last_error_code='EMAIL_SEND_FAILED',
              next_attempt_at = CASE WHEN $2::int IS NULL THEN NULL ELSE CURRENT_TIMESTAMP + make_interval(mins => $2::int) END, updated_at=CURRENT_TIMESTAMP
       WHERE notification_id=$1 AND channel='EMAIL'::notification_channel`,
      [notificationId, delay],
    );
    return "failed";
  }
}

/** Retries FAILED/PENDING emails that are due (bounded by MAX_EMAIL_ATTEMPTS). */
export async function retryEmailDeliveries(batch = 50): Promise<{ scanned: number; sent: number }> {
  const n = Math.min(Math.max(batch || 50, 1), 100);
  const rows = await query<{ notification_id: string }>(
    `SELECT notification_id FROM notification_deliveries
     WHERE channel='EMAIL'::notification_channel AND status IN ('PENDING'::notification_delivery_status,'FAILED'::notification_delivery_status)
       AND attempt_count < $2 AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
     ORDER BY updated_at ASC LIMIT $1`,
    [n, MAX_EMAIL_ATTEMPTS],
  );
  let sent = 0;
  for (const r of rows) if ((await deliverEmail(r.notification_id).catch(() => "failed")) === "sent") sent += 1;
  return { scanned: rows.length, sent };
}

export async function dispatchNotificationOutbox(batch = 50): Promise<{ scanned: number; completed: number }> {
  const n = Math.min(Math.max(batch || 50, 1), 100);
  const rows = await query<{ id: string; recipient_user_id: string; notification_type: string; domain_event_id: string; payload: unknown }>(
    `SELECT id, recipient_user_id, notification_type::text AS notification_type, domain_event_id, payload
     FROM notification_outbox
     WHERE status IN ('PENDING'::outbox_status, 'FAILED'::outbox_status)
       AND next_attempt_at <= CURRENT_TIMESTAMP AND attempt_count < 5
     ORDER BY next_attempt_at ASC, id ASC
     LIMIT $1`,
    [n],
  );
  let completed = 0;
  for (const row of rows) {
    const claimed = await execute(
      `UPDATE notification_outbox SET status='PROCESSING'::outbox_status, locked_at=CURRENT_TIMESTAMP, locked_by='dispatcher',
              attempt_count=attempt_count+1, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND status IN ('PENDING'::outbox_status, 'FAILED'::outbox_status)`,
      [row.id],
    );
    if (!claimed) continue;
    try {
      const payload = (row.payload && typeof row.payload === "object" ? row.payload : {}) as {
        title?: string;
        body?: string;
        actionPath?: string;
        templateKey?: string;
        deduplicationKey?: string;
      };
      const dedup = String(payload.deduplicationKey || `${row.domain_event_id}:${row.notification_type}`).slice(0, 180);
      await writeInbox({
        recipientUserId: row.recipient_user_id,
        type: isNotificationType(row.notification_type) ? row.notification_type : "EVENT_REMINDER",
        title: String(payload.title || "Pembaruan MyTicketIn"),
        body: String(payload.body || "Ada pembaruan pada akun Anda."),
        actionPath: payload.actionPath || null,
        deduplicationKey: dedup,
        domainEventId: row.domain_event_id,
      });
      const note = await query<{ id: string }>(
        `SELECT id FROM notifications WHERE recipient_user_id=$1 AND deduplication_key=$2 LIMIT 1`,
        [row.recipient_user_id, dedup],
      );
      const notificationId = note[0]?.id;
      if (notificationId) {
        await execute(
          `INSERT INTO notification_deliveries (id, notification_id, channel, status, template_key, sent_at)
           VALUES ($1,$2,'IN_APP'::notification_channel,'SENT'::notification_delivery_status,$3,CURRENT_TIMESTAMP)
           ON CONFLICT (notification_id, channel) DO NOTHING`,
          [newId(), notificationId, String(payload.templateKey || row.notification_type).slice(0, 80)],
        );
        const emailEligible = isEmailNotificationType(row.notification_type);
        await execute(
          `INSERT INTO notification_deliveries (id, notification_id, channel, status, template_key, provider)
           VALUES ($1,$2,'EMAIL'::notification_channel,$4::notification_delivery_status,$3,'sandbox')
           ON CONFLICT (notification_id, channel) DO NOTHING`,
          [newId(), notificationId, String(payload.templateKey || row.notification_type).slice(0, 80), emailEligible ? "PENDING" : "SKIPPED"],
        );
        // Email is best effort: its failure must never fail the in-app notification or the original transaction.
        if (emailEligible) await deliverEmail(notificationId).catch(() => undefined);
      }
      await execute(
        `UPDATE notification_outbox SET status='COMPLETED'::outbox_status, completed_at=CURRENT_TIMESTAMP, locked_at=NULL, locked_by=NULL,
                last_error_code=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [row.id],
      );
      completed += 1;
    } catch {
      await execute(
        `UPDATE notification_outbox SET status='FAILED'::outbox_status, locked_at=NULL, locked_by=NULL,
                last_error_code='DISPATCH_FAILED', next_attempt_at=CURRENT_TIMESTAMP + INTERVAL '2 minutes',
                updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [row.id],
      );
    }
  }
  return { scanned: rows.length, completed };
}

export async function produceEventReminders(batch = 100): Promise<{ scanned: number; enqueued: number }> {
  const n = Math.min(Math.max(batch || 100, 1), 500);
  const rows = await query<{ owner_user_id: string; event_id: string; title: string }>(
    `SELECT DISTINCT t.owner_user_id, e.id AS event_id, e.title
     FROM tickets t
     JOIN events e ON e.id = t.event_id
     JOIN orders o ON o.id = t.order_id
     WHERE e.status = 'PUBLISHED'
       AND t.status = 'UNUSED'
       AND o.status = 'PAID'
       AND e.starts_at - INTERVAL '24 hours' <= CURRENT_TIMESTAMP
       AND e.starts_at > CURRENT_TIMESTAMP
     ORDER BY e.id, t.owner_user_id
     LIMIT $1`,
    [n],
  );
  let enqueued = 0;
  for (const row of rows) {
    const before = await query<{ id: string }>(
      `SELECT id FROM notifications WHERE recipient_user_id=$1 AND deduplication_key=$2 LIMIT 1`,
      [row.owner_user_id, `event-reminder:${row.event_id}:${row.owner_user_id}`],
    );
    await notify({
      recipientUserId: row.owner_user_id,
      type: "EVENT_REMINDER",
      title: "Event dimulai dalam 24 jam",
      body: `Simpan tiket QR Anda untuk ${row.title}. Check-in hanya berlaku untuk tiket yang masih Unused.`,
      actionPath: "/dashboard/ticket",
      entityType: "Event",
      entityId: row.event_id,
      deduplicationKey: `event-reminder:${row.event_id}:${row.owner_user_id}`,
      domainEventId: `event-reminder:${row.event_id}`,
    });
    if (!before[0]) enqueued += 1;
  }
  return { scanned: rows.length, enqueued };
}
