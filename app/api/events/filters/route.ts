import { NextRequest } from "next/server";
import { listFilters } from "@/lib/server/catalog";
import { correlationId, jsonPublic, routeHandler } from "@/lib/server/http";

export const GET = routeHandler(async (req: NextRequest) => {
  const f = await listFilters();
  return jsonPublic(
    {
      data: { categories: f.categories, locations: f.locations, tags: f.tags },
      correlationId: correlationId(req),
    },
    300,
    900,
    req,
  );
});
