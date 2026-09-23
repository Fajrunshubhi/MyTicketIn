import { NextRequest, NextResponse } from "next/server";
import { appVersion } from "@/lib/env";
import { AppError, correlationId, jsonError, pingDatabase } from "@/lib/server/http";

export async function GET(req: NextRequest) {
  try {
    const id = correlationId(req);
    const ok = await pingDatabase();
    if (!ok) {
      throw new AppError("SERVICE_UNHEALTHY", "Layanan tidak siap.", {}, 503);
    }
    return NextResponse.json(
      {
        status: "ready",
        checks: { app: "ok", database: "ok" },
        version: appVersion(),
        correlationId: id,
      },
      { status: 200, headers: { "Cache-Control": "no-store", "X-Correlation-Id": id } },
    );
  } catch (err) {
    return jsonError(err, req);
  }
}
