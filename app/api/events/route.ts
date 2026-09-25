import { NextRequest } from "next/server";
import { listCatalog } from "@/lib/server/catalog";
import { correlationId, jsonPublic, routeHandler } from "@/lib/server/http";

export const GET = routeHandler(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams;
  const limitRaw = q.get("limit");
  let limit = 12;
  if (limitRaw) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n)) {
      const { AppError } = await import("@/lib/server/http");
      throw new AppError("CATALOG_QUERY_INVALID", "Parameter katalog tidak valid.", {}, 400);
    }
    limit = n;
  }
  const when = q.get("when") === "past" ? "past" : "upcoming";
  const result = await listCatalog({
    q: q.get("q") || "",
    category: q.get("category") || "",
    city: q.get("city") || "",
    province: q.get("province") || "",
    tag: q.get("tag") || "",
    limit,
    when,
  });
  return jsonPublic(
    {
      data: {
        items: result.items,
        nextCursor: result.nextCursor,
        appliedFilters: result.appliedFilters,
      },
      correlationId: correlationId(req),
    },
    60,
    300,
    req,
  );
});
