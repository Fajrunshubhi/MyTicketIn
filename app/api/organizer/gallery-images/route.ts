import { NextRequest } from "next/server";
import { AppError, jsonData, jsonError } from "@/lib/server/http";
import { requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { saveGalleryFile } from "@/lib/server/gallery";

export async function POST(req: NextRequest) {
  try {
    requireMutating(req);
    await requireOrganizerProfile(req);
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "Berkas gambar wajib diunggah.", {}, 400);
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const url = await saveGalleryFile(buf);
    return jsonData({ url }, 201, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
