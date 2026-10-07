import type { NextRequest } from "next/server";
import { AppError } from "@/lib/server/http";
import { MAX_DOCUMENT_BYTES } from "@/lib/server/organizer-documents";
import type { ApplicationBody, ApplicationFiles } from "@/lib/server/organizers";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

async function readFile(form: FormData, key: string): Promise<Buffer | null> {
  const v = form.get(key);
  if (!(v instanceof File) || v.size === 0) return null;
  if (v.size > MAX_DOCUMENT_BYTES) {
    throw new AppError("VALIDATION_ERROR", "Ukuran berkas maksimal 5 MB.", { [key]: "Ukuran maksimal 5 MB." }, 400);
  }
  return Buffer.from(await v.arrayBuffer());
}

/** Application is multipart because the identity photos travel with the text fields. */
export async function parseApplicationForm(
  req: NextRequest,
): Promise<{ body: ApplicationBody & { expectedVersion: number }; files: ApplicationFiles }> {
  const form = await req.formData().catch(() => null);
  if (!form) throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {}, 400);
  return {
    body: {
      name: text(form, "name"),
      contactEmail: text(form, "contactEmail"),
      contactPhone: text(form, "contactPhone"),
      description: text(form, "description"),
      organizerType: text(form, "organizerType"),
      picName: text(form, "picName"),
      city: text(form, "city"),
      referenceUrl: text(form, "referenceUrl"),
      bankName: text(form, "bankName"),
      bankAccountName: text(form, "bankAccountName"),
      bankAccountNumber: text(form, "bankAccountNumber"),
      consent: text(form, "consent") === "true",
      expectedVersion: Number(text(form, "expectedVersion") || 0),
    },
    files: { ktp: await readFile(form, "ktp"), selfie: await readFile(form, "selfie") },
  };
}
