export function getPublicApiBaseUrl(): string {
  const value = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
  return value || "http://localhost:8080";
}
