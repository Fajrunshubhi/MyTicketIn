import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { recommendations } from "@/lib/server/reporting";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const payload = await recommendations(params.slug, Number(req.nextUrl.searchParams.get("limit") || 6));
    return jsonData(payload, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
