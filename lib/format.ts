export function formatRupiah(amount: number): string {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("Nominal Rupiah harus integer >= 0.");
  }
  const grouped = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `Rp${grouped}`;
}

const ZONE_LABELS: Record<string, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT",
  UTC: "UTC",
};

function zoneLabel(timeZone: string): string {
  return ZONE_LABELS[timeZone] ?? timeZone;
}

export function formatDateTime(
  isoOrDate: string | Date,
  timeZone = "Asia/Jakarta"
): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) {
    throw new Error("Waktu tidak valid.");
  }
  const formatted = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
  return `${formatted} ${zoneLabel(timeZone)}`;
}

export function formatCheckInBefore(isoOrDate: string | Date, timeZone = "Asia/Jakarta"): string {
  return `Check-in sebelum ${formatDateTime(isoOrDate, timeZone)}.`;
}

export function formatRelativeId(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Waktu tidak valid.");
  }
  const delta = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(delta / 60000));
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  return `${days} hari lalu`;
}

export function formatEventDay(iso: string, timeZone = "Asia/Jakarta"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Waktu tidak valid.");
  }
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(date);
}

export function formatClock(iso: string, timeZone = "Asia/Jakarta"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Waktu tidak valid.");
  }
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}

export function formatClockWithZone(iso: string, timeZone = "Asia/Jakarta"): string {
  return `${formatClock(iso, timeZone)} ${zoneLabel(timeZone)}`;
}

const TIME_PARTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

export function utcIsoToNaiveLocal(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Waktu tidak valid.");
  }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, ...TIME_PARTS }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function naiveLocalToUtcIso(naive: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(naive)) {
    throw new Error("Waktu tidak valid.");
  }
  const [datePart, timePart] = naive.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, ...TIME_PARTS }).formatToParts(new Date(utc));
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
    const asIf = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), 0);
    utc += Date.UTC(year, month - 1, day, hour, minute, 0) - asIf;
  }
  return new Date(utc).toISOString();
}

