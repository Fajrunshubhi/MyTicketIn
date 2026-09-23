import { query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";

export async function listNotifications(user: AuthUser, limit: number) {
  return query<Record<string, unknown>>(
    `SELECT id, type::text AS type, title, body, action_path, read_at::text, created_at::text
     FROM notifications WHERE recipient_user_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [user.id, Math.min(Math.max(limit || 20, 1), 50)],
  );
}

export async function markAllRead(user: AuthUser) {
  await query(`UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE recipient_user_id=$1 AND read_at IS NULL`, [
    user.id,
  ]);
}

export async function markRead(user: AuthUser, id: string) {
  await query(`UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id=$1 AND recipient_user_id=$2`, [id, user.id]);
}
