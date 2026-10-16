function readEnv(name: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  return String(process.env[name] || "").trim();
}

export type PlatformDocumentIssuer = {
  name: string;
  tagline: string;
  city: string;
  address: string;
  email: string;
  phone: string;
  nib: string;
  npwp: string;
};

/**
 * Identitas penerbit dokumen transaksi. NPWP/NIB hanya tampil jika diisi
 * di environment; jangan mengarang nomor pajak.
 */
export function platformDocumentIssuer(): PlatformDocumentIssuer {
  return {
    name: readEnv("NEXT_PUBLIC_PLATFORM_LEGAL_NAME") || "MyTicketIn",
    tagline: "Penyelenggara sistem elektronik tiket event tatap muka",
    city: readEnv("NEXT_PUBLIC_PLATFORM_CITY") || "Jakarta",
    address: readEnv("NEXT_PUBLIC_PLATFORM_ADDRESS"),
    email: readEnv("NEXT_PUBLIC_PLATFORM_EMAIL"),
    phone: readEnv("NEXT_PUBLIC_PLATFORM_PHONE"),
    nib: readEnv("NEXT_PUBLIC_PLATFORM_NIB"),
    npwp: readEnv("NEXT_PUBLIC_PLATFORM_NPWP"),
  };
}

export function documentAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  const raw = readEnv("NEXT_PUBLIC_API_BASE_URL") || readEnv("WEB_ORIGIN") || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

export function orderDocumentVerifyUrl(orderId?: string): string {
  if (!orderId) return "";
  return `${documentAppOrigin()}/dashboard/order/${orderId}`;
}
