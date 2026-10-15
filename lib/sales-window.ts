/** Ticket sales must end at least 24 hours before the event starts (H-1). */
export const SALE_LEAD_MS = 24 * 60 * 60 * 1000;

export function maxSaleEndsAt(eventStartsAt: string | Date): Date {
  return new Date(new Date(eventStartsAt).getTime() - SALE_LEAD_MS);
}

export function saleWindowError(saleStart: Date, saleEnd: Date, eventStart: Date): string | null {
  if (Number.isNaN(saleStart.getTime()) || Number.isNaN(saleEnd.getTime()) || !(saleStart < saleEnd)) {
    return "Selesai jual harus setelah mulai jual.";
  }
  if (Number.isNaN(eventStart.getTime()) || saleEnd.getTime() > eventStart.getTime() - SALE_LEAD_MS) {
    return "Penjualan paling lambat H-1 (24 jam sebelum kegiatan event dimulai).";
  }
  return null;
}
