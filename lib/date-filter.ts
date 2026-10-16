export type DateFilterMode = "on" | "range";

const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function inferDateFilterMode(dateFrom: string, dateTo: string): DateFilterMode {
  if (dateFrom && dateTo && dateFrom === dateTo) return "on";
  if (dateFrom || dateTo) return "range";
  return "on";
}

export function parseDateFilterMode(raw: FormDataEntryValue | null): DateFilterMode {
  return raw === "range" ? "range" : "on";
}

/** When the date-mode controls are not in the form, keep existing from/to values. */
export function readDateFilterFromForm(fd: FormData): { dateFrom: string; dateTo: string } {
  if (!fd.has("dateMode")) {
    return {
      dateFrom: String(fd.get("dateFrom") || "").trim(),
      dateTo: String(fd.get("dateTo") || "").trim(),
    };
  }
  return resolveDateFilter(parseDateFilterMode(fd.get("dateMode")), {
    dateOn: String(fd.get("dateOn") || ""),
    dateFrom: String(fd.get("dateFrom") || ""),
    dateTo: String(fd.get("dateTo") || ""),
  });
}

export function resolveDateFilter(
  mode: DateFilterMode,
  values: { dateOn?: string; dateFrom?: string; dateTo?: string },
): { dateFrom: string; dateTo: string } {
  if (mode === "on") {
    const d = (values.dateOn || "").trim();
    return { dateFrom: d, dateTo: d };
  }
  return {
    dateFrom: (values.dateFrom || "").trim(),
    dateTo: (values.dateTo || "").trim(),
  };
}

export function formatFilterDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${d} ${MONTHS_ID[m - 1]} ${y}`;
}

export function dateFilterChipLabel(dateFrom: string, dateTo: string): string | null {
  if (dateFrom && dateTo && dateFrom === dateTo) return `Tanggal: ${formatFilterDate(dateFrom)}`;
  if (dateFrom && dateTo) return `${formatFilterDate(dateFrom)}–${formatFilterDate(dateTo)}`;
  if (dateFrom) return `Mulai ${formatFilterDate(dateFrom)}`;
  if (dateTo) return `Sampai ${formatFilterDate(dateTo)}`;
  return null;
}
