import { AppError, query } from "@/lib/server/http";

export type Access = {
  kind: string;
  isAdmin: boolean;
  canBuy: boolean;
  canOrganize: boolean;
  canApplyOrganizer: boolean;
  organizerStatus: string | null;
};

export type AuthUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  status: string;
  authVersion: number;
};

export async function accessFor(user: AuthUser): Promise<Access> {
  const acc: Access = {
    kind: "buyer",
    isAdmin: user.role === "ADMIN",
    canBuy: user.role === "USER",
    canOrganize: false,
    canApplyOrganizer: user.role === "USER",
    organizerStatus: null,
  };
  if (acc.isAdmin) {
    acc.kind = "admin";
    acc.canBuy = false;
    acc.canApplyOrganizer = false;
    return acc;
  }
  const rows = await query<{ status: string }>(
    `SELECT status::text AS status FROM organizer_profiles WHERE owner_user_id = $1 LIMIT 1`,
    [user.id],
  );
  const status = rows[0]?.status;
  if (!status) return acc;
  acc.organizerStatus = status;
  if (status.toUpperCase() === "APPROVED") {
    acc.canOrganize = true;
    acc.canBuy = false;
    acc.canApplyOrganizer = false;
    acc.kind = "organizer";
  }
  return acc;
}

export function parsePortal(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) return "buyer";
  if (v === "buyer" || v === "organizer" || v === "admin") return v;
  throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {
    portal: "Pilih pembeli tiket, penyelenggara, atau admin aplikasi.",
  });
}

export function parseRegisterIntent(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v || v === "buyer" || v === "organizer") return "buyer";
  if (v === "admin") {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {
      intent: "Admin aplikasi tidak didaftarkan melalui formulir ini.",
    });
  }
  throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {
    intent: "Daftar sebagai pembeli tiket. Pengajuan penyelenggara dilakukan setelah masuk.",
  });
}

export function resolvePortal(raw: string, acc: Access): string {
  if (!raw.trim()) return acc.kind || "buyer";
  return parsePortal(raw);
}

export function authorizePortal(portal: string, acc: Access): string | null {
  if (portal === "admin") {
    return acc.isAdmin ? null : "Akun ini bukan admin aplikasi.";
  }
  if (portal === "organizer") {
    if (acc.isAdmin) return "Akun admin harus masuk melalui portal Admin aplikasi.";
    if (!acc.canOrganize) return "Masuk sebagai pembeli tiket. Pengajuan sebagai penyelenggara dilakukan setelah Anda masuk.";
    return null;
  }
  if (portal === "buyer") {
    if (acc.isAdmin) return "Akun admin harus masuk melalui portal Admin aplikasi.";
    if (acc.canOrganize) return "Akun ini adalah penyelenggara event. Masuk melalui portal Penyelenggara event.";
    return null;
  }
  return "Jenis akun tidak cocok dengan portal yang dipilih.";
}

export function portalNextPath(portal: string, acc: Access, callback: string): string {
  let fallback = "/";
  if (portal === "admin") fallback = "/dashboard";
  const path = safeCallback(callback, fallback);
  if (!portalAllowsPath(portal, path)) return fallback;
  return path;
}

function safeCallback(raw: string, fallback: string): string {
  const v = raw.trim();
  if (!v) return fallback;
  if (v.startsWith("/") && !v.startsWith("//") && !v.includes("\\")) return v;
  return fallback;
}

function portalAllowsPath(portal: string, path: string): boolean {
  if (portal === "admin") {
    return path === "/dashboard" || path === "/home" || path.startsWith("/admin/") || path === "/admin";
  }
  if (portal === "organizer") {
    return (
      path === "/" ||
      path === "/dashboard" ||
      path.startsWith("/dashboard/") ||
      path === "/organizer/events" ||
      path.startsWith("/organizer/events/") ||
      path === "/organizer/dashboard"
    );
  }
  if (path.startsWith("/admin") || path.startsWith("/organizer/events")) return false;
  return true;
}

export function userPayload(user: AuthUser, portal: string, acc: Access, callback: string) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    portal,
    access: acc,
    nextPath: portalNextPath(portal, acc, callback),
  };
}
