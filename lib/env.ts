function trimOrigin(value: string): string {
  return value.trim().replace(/\/$/, "");
}

/** Origin of the Go API. Browser calls stay same-origin via Next rewrites. */
export function getPublicApiBaseUrl(): string {
  const explicit = trimOrigin(String(process.env.API_ORIGIN || process.env.NEXT_PUBLIC_API_BASE_URL || ""));
  if (explicit) {
    return explicit;
  }
  return "http://127.0.0.1:8080";
}
