import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { scannerAccess } from "@/lib/server/checkin";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await requireAuth(req);
    const out = await scannerAccess(user, params.slug);
    return jsonData(out, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
