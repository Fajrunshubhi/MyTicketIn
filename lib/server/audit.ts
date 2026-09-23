import { AppError, query } from "@/lib/server/http";

function iso(v: unknown): string {
  return new Date(String(v)).toISOString();
}

export async function listAuditLogs(sp: URLSearchParams) {
  const action = (sp.get("action") || "").trim();
  const entityType = (sp.get("entityType") || "").trim();
  const entityId = (sp.get("entityId") || "").trim();
  const actorUserId = (sp.get("actorUserId") || "").trim();
  const outcome = (sp.get("outcome") || "").trim().toUpperCase();
  const from = (sp.get("from") || "").trim() || null;
  const to = (sp.get("to") || "").trim() || null;
  const limit = Math.min(Math.max(Number(sp.get("limit") || 25), 1), 100);
  const rows = await query<{
    id: string;
    occurred_at: string;
    actor_type: string;
    actor_user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    outcome: string;
    reason_code: string | null;
    correlation_id: string;
    schema_version: number;
  }>(
    `SELECT id, occurred_at::text, actor_type::text AS actor_type, actor_user_id, action, entity_type, entity_id,
            outcome::text AS outcome, reason_code, correlation_id, schema_version
     FROM audit_logs
     WHERE ($1='' OR action=$1)
       AND ($2='' OR entity_type=$2)
       AND ($3='' OR entity_id=$3)
       AND ($4='' OR actor_user_id=$4)
       AND ($5='' OR outcome::text=$5)
       AND ($6::timestamptz IS NULL OR occurred_at >= $6)
       AND ($7::timestamptz IS NULL OR occurred_at < $7)
     ORDER BY occurred_at DESC, id DESC
     LIMIT $8`,
    [action, entityType, entityId, actorUserId, outcome, from, to, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    occurredAt: iso(r.occurred_at),
    actorType: r.actor_type,
    actorUserId: r.actor_user_id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    outcome: r.outcome,
    reasonCode: r.reason_code,
    correlationId: r.correlation_id,
    schemaVersion: r.schema_version,
  }));
}

export async function getAuditLog(id: string) {
  const rows = await query<{
    id: string;
    occurred_at: string;
    actor_type: string;
    actor_user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    outcome: string;
    reason_code: string | null;
    correlation_id: string;
    before_data: Record<string, unknown> | null;
    after_data: Record<string, unknown> | null;
    metadata: Record<string, unknown>;
    schema_version: number;
  }>(
    `SELECT id, occurred_at::text, actor_type::text AS actor_type, actor_user_id, action, entity_type, entity_id,
            outcome::text AS outcome, reason_code, correlation_id, before_data, after_data, metadata, schema_version
     FROM audit_logs WHERE id=$1 LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) throw new AppError("NOT_FOUND", "Catatan audit tidak ditemukan.", {}, 404);
  return {
    id: r.id,
    occurredAt: iso(r.occurred_at),
    actorType: r.actor_type,
    actorUserId: r.actor_user_id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    outcome: r.outcome,
    reasonCode: r.reason_code,
    correlationId: r.correlation_id,
    before: r.before_data,
    after: r.after_data,
    metadata: r.metadata,
    schemaVersion: r.schema_version,
  };
}
