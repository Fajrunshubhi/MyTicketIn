export function ticketStatusLabel(status: string, eventEnded = false): string {
  if (status === "CANCELLED") return "Dibatalkan";
  if (status === "USED") return "Sudah check-in";
  if (eventEnded) return "Tidak berlaku";
  if (status === "UNUSED") return "Siap dipakai";
  return status;
}

export function ticketStatusClass(status: string, eventEnded = false): string {
  if (status === "USED") return "bg-emerald-50 text-emerald-800";
  if (status === "CANCELLED" || (eventEnded && status === "UNUSED")) return "bg-stone-100 text-ink/60";
  if (status === "UNUSED") return "bg-[#eee8ff] text-gold-800";
  return "bg-stone-100 text-ink/55";
}
