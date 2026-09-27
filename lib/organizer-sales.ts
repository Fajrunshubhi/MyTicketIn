export function organizerSalesBlocked(status: string | null | undefined): boolean {
  const s = String(status || "").toUpperCase();
  return s === "SUSPENDED" || s === "REJECTED";
}
