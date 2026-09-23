import { NextRequest } from "next/server";
import { parseNaturalFilter } from "@/lib/server/catalog";
import { jsonData, routeHandler } from "@/lib/server/http";

export const POST = routeHandler(async (req: NextRequest) => {
  const body = (await req.json().catch(() => null)) as { naturalLanguage?: string } | null;
  if (!body || typeof body.naturalLanguage !== "string") {
    const { AppError } = await import("@/lib/server/http");
    throw new AppError("CATALOG_NATURAL_QUERY_INVALID", "Teks pencarian alami tidak valid.", {}, 400);
  }
  return jsonData(parseNaturalFilter(body.naturalLanguage), 200, req);
});
