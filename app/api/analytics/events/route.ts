import { NextRequest } from "next/server";
import { AppError, jsonData, newId, query, routeHandler, tokenHash } from "@/lib/server/http";
import { requireMutating } from "@/lib/server/guard";
import { clientIp, hitRateLimit } from "@/lib/server/rate-limit";
import { sessionFromRequest } from "@/lib/server/session";

// Allowlist keeps the table free of arbitrary client-chosen event names.
const EVENT_NAMES = new Set([
  "catalog_viewed",
  "event_viewed",
  "checkout_started",
  "search_submitted",
  "ai_search_used",
]);
const ENTITY_TYPES = new Set(["event", "order", "catalog"]);
const MAX_PROPS_BYTES = 2000;

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const ip = clientIp(req);
  await hitRateLimit("analytics", ip, 120, 60);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = String(body?.eventName || "");
  if (!body || !EVENT_NAMES.has(name))
    throw new AppError("VALIDATION_ERROR", "Event analitik tidak dikenal.", {}, 400);
  const entityType = body.entityType ? String(body.entityType) : null;
  if (entityType && !ENTITY_TYPES.has(entityType))
    throw new AppError("VALIDATION_ERROR", "Tipe entitas tidak dikenal.", {}, 400);
  const entityId = body.entityId ? String(body.entityId).slice(0, 80) : null;
  const props =
    body.properties && typeof body.properties === "object" && !Array.isArray(body.properties) ? body.properties : {};
  if (JSON.stringify(props).length > MAX_PROPS_BYTES)
    throw new AppError("VALIDATION_ERROR", "Properti analitik terlalu besar.", {}, 400);

  const user = (await sessionFromRequest(req))?.user ?? null;
  const anon = user ? null : tokenHash(`anon|${ip}|${req.headers.get("user-agent") || ""}`);
  const id = newId();
  await query(
    `INSERT INTO analytics_events (id, event_name, actor_user_id, anonymous_id_hash, entity_type, entity_id, correlation_id, properties)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [id, name, user?.id ?? null, anon, entityType, entityId, `req_${id}`, JSON.stringify(props)],
  );
  return jsonData({ accepted: true }, 202, req);
});
