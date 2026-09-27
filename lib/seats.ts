export const MAX_AUTO_SEATS = 500;

export function seatPrefix(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Indeks prefix kursi tidak valid.");
  }
  let n = index + 1;
  let out = "";
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

export function generateSeatLabels(prefix: string, quota: number): string[] {
  const letter = String(prefix || "").trim().toUpperCase();
  const q = Math.trunc(quota);
  if (!letter || !Number.isInteger(q) || q < 1) return [];
  const count = Math.min(q, MAX_AUTO_SEATS);
  return Array.from({ length: count }, (_, i) => `${letter}${i + 1}`);
}

export function reservedSeatsFromTypes(
  ticketTypes: { id: string; quota: number }[],
  sections: { id: string; ticketTypeId: string }[],
): { sectionId: string; label: string }[] {
  const typeIndex = new Map(ticketTypes.map((t, i) => [t.id, i]));
  const claimed = new Set<string>();
  const seats: { sectionId: string; label: string }[] = [];
  for (const section of sections) {
    if (!section.id || claimed.has(section.ticketTypeId)) continue;
    claimed.add(section.ticketTypeId);
    const type = ticketTypes.find((t) => t.id === section.ticketTypeId);
    if (!type) continue;
    const prefix = seatPrefix(typeIndex.get(type.id) ?? 0);
    for (const label of generateSeatLabels(prefix, type.quota)) {
      seats.push({ sectionId: section.id, label });
    }
  }
  return seats;
}

export function seatPreview(labels: string[], take = 8): string {
  if (labels.length === 0) return "Belum ada kursi";
  if (labels.length <= take) return labels.join(", ");
  return `${labels.slice(0, take).join(", ")} … ${labels[labels.length - 1]}`;
}
