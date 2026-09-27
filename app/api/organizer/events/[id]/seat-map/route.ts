import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { saveSeatMap } from "@/lib/server/event-extras";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const contentType = req.headers.get("content-type") || "";
    let altText = "";
    let legend = "";
    let expectedVersion = 0;
    let image: Buffer | undefined;
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      altText = String(form.get("altText") || "");
      legend = String(form.get("legend") || "");
      expectedVersion = Number(form.get("expectedVersion") || 0);
      const file = form.get("image");
      if (file instanceof File && file.size > 0) {
        image = Buffer.from(await file.arrayBuffer());
      }
    } else {
      const body = await readJson<{ expectedVersion?: number; altText?: string; legend?: string }>(req);
      altText = String(body.altText || "");
      legend = String(body.legend || "");
      expectedVersion = Number(body.expectedVersion || 0);
    }
    await saveSeatMap(organizerProfileId, params.id, altText, legend, expectedVersion, image);
    return jsonData({ ok: true }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
