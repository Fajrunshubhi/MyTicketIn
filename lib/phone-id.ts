/** Normalize Indonesian mobile numbers to 62… for Midtrans customer_details.phone. */
export function parsePhoneId(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  let n = digits;
  if (n.startsWith("0")) n = `62${n.slice(1)}`;
  if (n.startsWith("8")) n = `62${n}`;
  if (!n.startsWith("62")) return null;
  if (n.length < 11 || n.length > 15) return null;
  return n;
}

export function displayPhoneId(stored: string | null | undefined): string {
  const n = String(stored || "");
  if (n.startsWith("62")) return `0${n.slice(2)}`;
  return n;
}
