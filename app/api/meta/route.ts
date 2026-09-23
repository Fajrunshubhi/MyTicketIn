import { NextRequest, NextResponse } from "next/server";
import { appEnv, appVersion } from "@/lib/env";
import { jsonError } from "@/lib/server/http";

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(
      { locale: "id-ID", currency: "IDR", environment: appEnv(), version: appVersion() },
      { status: 200, headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (err) {
    return jsonError(err, req);
  }
}
