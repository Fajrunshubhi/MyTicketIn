import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { recommendations } from "@/lib/server/reporting";
import { sessionFromRequest } from "@/lib/server/session";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    // Sesi opsional: tanpa sesi hasilnya kontekstual saja.
    const sess = await sessionFromRequest(req).catch(() => null);
    const payload = await recommendations(
      params.slug,
      Number(req.nextUrl.searchParams.get("limit") || 6),
      sess?.user.id ?? null,
    );
    return jsonData(payload, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
