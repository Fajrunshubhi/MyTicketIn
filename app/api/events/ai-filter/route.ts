import { NextRequest } from "next/server";
import { resolveNaturalFilter } from "@/lib/server/catalog-ai";
import { AppError, clientIp, jsonData, routeHandler } from "@/lib/server/http";

const MAX_BODY_BYTES = 4 * 1024;

export const POST = routeHandler(async (req: NextRequest) => {
  const rawBody = await req.text().catch(() => "");
  if (!rawBody || Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    throw new AppError("CATALOG_NATURAL_QUERY_INVALID", "Teks pencarian alami tidak valid.", {}, 400);
  }
  let body: { naturalLanguage?: unknown } | null = null;
  try {
    body = JSON.parse(rawBody) as { naturalLanguage?: unknown };
  } catch {
    body = null;
  }
  if (!body || typeof body.naturalLanguage !== "string") {
    throw new AppError("CATALOG_NATURAL_QUERY_INVALID", "Teks pencarian alami tidak valid.", {}, 400);
  }
  const { result, reason, detail } = await resolveNaturalFilter(body.naturalLanguage, clientIp(req));
  // Metadata only: no input text, prompt, or output (RFC-007 privacy rule).
  console.info(
    JSON.stringify({
      event: result.mode === "AI" ? "catalog_natural_filter_parsed" : "catalog_natural_filter_fallback",
      reason: reason ?? null,
      detail: detail ?? null,
      filterKeys: Object.keys(result.filterDto),
    }),
  );
  return jsonData(result, 200, req);
});
