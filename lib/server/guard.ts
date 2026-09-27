import { NextRequest } from "next/server";
import { accessFor, type Access, type AuthUser } from "@/lib/server/access";
import { requireCsrf } from "@/lib/server/cookies";
import { AppError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export async function requireAuth(req: NextRequest): Promise<AuthUser> {
  return requireUser(req);
}

export async function requireAuthAccess(req: NextRequest): Promise<{ user: AuthUser; acc: Access }> {
  const user = await requireUser(req);
  const acc = await accessFor(user);
  return { user, acc };
}

export async function requireAdmin(req: NextRequest): Promise<AuthUser> {
  const user = await requireUser(req);
  if (user.role !== "ADMIN") throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
  return user;
}

export async function requireBuyer(req: NextRequest): Promise<AuthUser> {
  const { user, acc } = await requireAuthAccess(req);
  if (!acc.canBuy) throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
  return user;
}

export async function requireOrganizerProfile(req: NextRequest): Promise<{ user: AuthUser; organizerProfileId: string }> {
  const user = await requireUser(req);
  const acc = await accessFor(user);
  const write = req.method !== "GET" && req.method !== "HEAD";
  if (write && !acc.canOrganize) {
    if (acc.organizerStatus === "SUSPENDED") {
      throw new AppError("ORGANIZER_SUSPENDED", "Akses tulis ditahan. Data lama tetap dapat dilihat.", {}, 403);
    }
    throw new AppError("ORGANIZER_NOT_APPROVED", "Organizer belum disetujui.", {}, 403);
  }
  if (!write && acc.kind !== "organizer") {
    throw new AppError("ORGANIZER_NOT_APPROVED", "Organizer belum disetujui.", {}, 403);
  }
  const { query } = await import("@/lib/server/http");
  const rows = await query<{ id: string; status: string }>(
    `SELECT id, status::text AS status FROM organizer_profiles WHERE owner_user_id = $1 LIMIT 1`,
    [user.id],
  );
  const row = rows[0];
  if (!row) throw new AppError("ORGANIZER_NOT_APPROVED", "Organizer belum disetujui.", {}, 403);
  if (write && row.status !== "APPROVED") {
    throw new AppError("ORGANIZER_SUSPENDED", "Akses tulis ditahan. Data lama tetap dapat dilihat.", {}, 403);
  }
  if (!write && row.status !== "APPROVED" && row.status !== "SUSPENDED") {
    throw new AppError("ORGANIZER_NOT_APPROVED", "Organizer belum disetujui.", {}, 403);
  }
  return { user, organizerProfileId: row.id };
}

export function requireMutating(req: NextRequest): void {
  requireCsrf(req);
}

export function requireScheduler(req: NextRequest): void {
  const want = String(process.env.SCHEDULER_SECRET || process.env.SESSION_SECRET || "");
  const got = req.headers.get("x-scheduler-secret") || "";
  if (!want || !got || want !== got) {
    throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
  }
}

export async function readJson<T>(req: NextRequest): Promise<T> {
  const body = (await req.json().catch(() => null)) as T | null;
  if (body === null) throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {}, 400);
  return body;
}
