import { NextRequest, NextResponse } from "next/server";
import { appVersion } from "@/lib/env";
import { correlationId, jsonError } from "@/lib/server/http";

export async function GET(req: NextRequest) {
  try {
    const id = correlationId(req);
    return NextResponse.json(
      { status: "ok", version: appVersion(), correlationId: id },
      { status: 200, headers: { "Cache-Control": "no-store", "X-Correlation-Id": id } },
    );
  } catch (err) {
    return jsonError(err, req);
  }
}
