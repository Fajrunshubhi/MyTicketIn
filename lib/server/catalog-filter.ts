import { AppError } from "@/lib/server/http";

/**
 * F77: natural language -> catalog filter. The model (or fake) may only ever produce a CatalogFilterDraft; everything
 * else (SQL, status, event ids, cursors) has no field to live in, and unknown keys are rejected.
 */
export type CatalogFilterDraft = {
  q?: string;
  category?: string;
  city?: string;
  province?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: "soonest" | "newest";
};

export type CatalogFilterOptions = {
  categories: string[];
  locations: { city: string; province: string }[];
};

export type CatalogFilterInput = {
  naturalLanguage: string;
  locale: "id-ID";
  /** YYYY-MM-DD in Asia/Jakarta. */
  today: string;
  timezone: "Asia/Jakarta";
  allowedCategories: string[];
  allowedLocations: { city: string; province: string }[];
  outputSchemaVersion: "catalog-filter.v1";
};

/** Provider-neutral port. Implementations receive untrusted text and return untrusted output. */
export interface AiCatalogFilterPort {
  parseCatalogFilter(input: CatalogFilterInput, signal?: AbortSignal): Promise<unknown>;
}

export type CatalogChip = { key: string; label: string; value: string };

export type NaturalFilterResult = {
  /** AI = model reply; RULE_BASED_FALLBACK = deterministic parser after the model failed; BASIC = plain keyword search. */
  mode: "AI" | "RULE_BASED_FALLBACK" | "BASIC_SEARCH_FALLBACK";
  filterDto: CatalogFilterDraft;
  chips: CatalogChip[];
  canonicalQuery: string;
  notice?: string;
};

const ALLOWED_KEYS = new Set(["q", "category", "city", "province", "dateFrom", "dateTo", "sort"]);
const MAX_OUTPUT_BYTES = 8 * 1024;
const MAX_RANGE_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const FALLBACK_NOTICE = "Filter AI tidak tersedia; pencarian kata kunci digunakan.";
const CATEGORY_SYNONYMS: Record<string, RegExp> = {
  musik: /\b(konser|festival musik|jazz|band)\b/,
  olahraga: /\b(lari|marathon|maraton|futsal|sepak ?bola|badminton|sepeda|fun run|olah ?raga)\b/,
};
export const RULE_BASED_NOTICE = "Filter AI tidak tersedia; filter dibuat dengan penerjemah aturan sederhana.";

export class AiOutputInvalid extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

function dayNumber(iso: string): number | null {
  if (!DATE_RE.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t / 86_400_000;
}

/** Shared by the catalog route and the AI normalizer so both enforce the same date rules. */
export function validateDateRange(dateFrom: string, dateTo: string): { dateFrom: string; dateTo: string } {
  const from = dateFrom.trim();
  const to = dateTo.trim();
  if (!from && !to) return { dateFrom: "", dateTo: "" };
  const a = from ? dayNumber(from) : null;
  const b = to ? dayNumber(to) : null;
  if ((from && a === null) || (to && b === null)) {
    throw new AppError("CATALOG_DATE_RANGE_INVALID", "Rentang tanggal tidak valid.", {}, 400);
  }
  if (a !== null && b !== null && (b < a || b - a > MAX_RANGE_DAYS)) {
    throw new AppError("CATALOG_DATE_RANGE_INVALID", "Rentang tanggal tidak valid.", {}, 400);
  }
  return { dateFrom: from, dateTo: to };
}

export function normalizeNaturalText(raw: string): string {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  const n = [...s].length;
  if (n < 2 || n > 300) {
    throw new AppError("CATALOG_NATURAL_QUERY_INVALID", "Teks pencarian alami tidak valid.", {}, 400);
  }
  return s;
}

export function buildResult(
  filterDto: CatalogFilterDraft,
  mode: NaturalFilterResult["mode"],
  notice?: string,
): NaturalFilterResult {
  const chips: CatalogChip[] = [];
  const sp = new URLSearchParams();
  // Fixed key order keeps the canonical URL stable.
  if (filterDto.q) {
    chips.push({ key: "q", label: "Kata kunci", value: filterDto.q });
    sp.set("q", filterDto.q);
  }
  if (filterDto.category) {
    chips.push({ key: "category", label: "Kategori", value: filterDto.category });
    sp.set("category", filterDto.category.toLowerCase());
  }
  if (filterDto.city) {
    chips.push({ key: "city", label: "Kota", value: filterDto.city });
    sp.set("city", filterDto.city.toLowerCase());
  }
  if (filterDto.province) {
    chips.push({ key: "province", label: "Provinsi", value: filterDto.province });
    sp.set("province", filterDto.province.toLowerCase());
  }
  if (filterDto.dateFrom) {
    chips.push({ key: "dateFrom", label: "Mulai", value: filterDto.dateFrom });
    sp.set("dateFrom", filterDto.dateFrom);
  }
  if (filterDto.dateTo) {
    chips.push({ key: "dateTo", label: "Sampai", value: filterDto.dateTo });
    sp.set("dateTo", filterDto.dateTo);
  }
  if (filterDto.sort && filterDto.sort !== "soonest") {
    chips.push({ key: "sort", label: "Urutan", value: filterDto.sort === "newest" ? "Terbaru" : "Terdekat" });
    sp.set("sort", filterDto.sort);
  }
  return { mode, filterDto, chips, canonicalQuery: sp.toString(), ...(notice ? { notice } : {}) };
}

export function fallbackResult(normalizedText: string): NaturalFilterResult {
  const q = [...normalizedText].slice(0, 100).join("");
  return buildResult({ q, sort: "soonest" }, "BASIC_SEARCH_FALLBACK", FALLBACK_NOTICE);
}

function str(value: unknown, max: number, field: string): string {
  if (typeof value !== "string") throw new AiOutputInvalid(`${field}_type`);
  const v = value.trim();
  if (!v || [...v].length > max) throw new AiOutputInvalid(`${field}_length`);
  if (/[\u0000-\u001f<>]/.test(v)) throw new AiOutputInvalid(`${field}_chars`);
  return v;
}

/**
 * Strictly validates untrusted model output: object only, size cap, no unknown keys, values matched against the
 * Published-event allowlist (exact, case-insensitive). Throws AiOutputInvalid, which the service turns into the F19 fallback.
 */
export function validateDraft(output: unknown, options: CatalogFilterOptions): CatalogFilterDraft {
  if (typeof output === "string") {
    if (output.length > MAX_OUTPUT_BYTES) throw new AiOutputInvalid("too_large");
    try {
      output = JSON.parse(output);
    } catch {
      throw new AiOutputInvalid("not_json");
    }
  }
  if (!output || typeof output !== "object" || Array.isArray(output)) throw new AiOutputInvalid("not_object");
  if (JSON.stringify(output).length > MAX_OUTPUT_BYTES) throw new AiOutputInvalid("too_large");
  const o = output as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    if (!ALLOWED_KEYS.has(key)) throw new AiOutputInvalid("unknown_key");
  }
  const draft: CatalogFilterDraft = {};
  if (o.q !== undefined) draft.q = str(o.q, 100, "q");
  if (o.category !== undefined) {
    const v = str(o.category, 80, "category").toLowerCase();
    const hit = options.categories.find((c) => c.toLowerCase() === v);
    if (!hit) throw new AiOutputInvalid("unknown_category");
    draft.category = hit;
  }
  if (o.city !== undefined) {
    const v = str(o.city, 80, "city").toLowerCase();
    const hit = options.locations.find((l) => l.city.toLowerCase() === v);
    if (!hit) throw new AiOutputInvalid("unknown_city");
    draft.city = hit.city;
  }
  if (o.province !== undefined) {
    const v = str(o.province, 80, "province").toLowerCase();
    const hit = options.locations.find((l) => l.province.toLowerCase() === v);
    if (!hit) throw new AiOutputInvalid("unknown_province");
    draft.province = hit.province;
  }
  if (o.dateFrom !== undefined) draft.dateFrom = str(o.dateFrom, 10, "dateFrom");
  if (o.dateTo !== undefined) draft.dateTo = str(o.dateTo, 10, "dateTo");
  try {
    validateDateRange(draft.dateFrom ?? "", draft.dateTo ?? "");
  } catch {
    throw new AiOutputInvalid("bad_date_range");
  }
  if (o.sort !== undefined) {
    if (o.sort !== "soonest" && o.sort !== "newest") throw new AiOutputInvalid("bad_sort");
    draft.sort = o.sort;
  }
  if (Object.keys(draft).length === 0) throw new AiOutputInvalid("empty");
  return draft;
}

function addDays(iso: string, days: number): string {
  const n = dayNumber(iso);
  if (n === null) return iso;
  return new Date((n + days) * 86_400_000).toISOString().slice(0, 10);
}

function weekday(iso: string): number {
  const n = dayNumber(iso) ?? 0;
  return new Date(n * 86_400_000).getUTCDay(); // 0 = Sunday
}

/**
 * Deterministic, rule-based parser behind the same port a model would use. It is not a language model: it exists so
 * the feature, the validators, and the fallback can be exercised and demoed without a provider or any cost.
 * `failure` simulates provider problems for tests.
 */
export class DeterministicCatalogFilterParser implements AiCatalogFilterPort {
  constructor(private readonly failure?: "timeout" | "unavailable" | "malformed" | "forbidden" | "unknown-category") {}

  async parseCatalogFilter(input: CatalogFilterInput): Promise<unknown> {
    if (this.failure === "timeout") return new Promise(() => undefined);
    if (this.failure === "unavailable") throw new Error("provider unavailable");
    if (this.failure === "malformed") return "{not json";
    if (this.failure === "forbidden") return { status: "DRAFT", category: "Musik" };
    if (this.failure === "unknown-category") return { category: "Kategori Tidak Ada" };

    const text = input.naturalLanguage.toLowerCase();
    const draft: CatalogFilterDraft = {};
    const has = (re: RegExp) => re.test(text);

    const category = [...input.allowedCategories]
      .sort((a, b) => b.length - a.length)
      .find((c) => has(new RegExp(`(^|[^a-z0-9])${escapeRe(c.toLowerCase())}([^a-z0-9]|$)`)));
    // Common words people use instead of the category name; only applied if that category really exists.
    const synonym = Object.entries(CATEGORY_SYNONYMS).find(([, re]) => has(re))?.[0];
    const viaSynonym = synonym && input.allowedCategories.find((c) => c.toLowerCase() === synonym);
    if (category) draft.category = category;
    else if (viaSynonym) draft.category = viaSynonym;

    const loc = [...input.allowedLocations]
      .sort((a, b) => b.city.length - a.city.length)
      .find((l) => has(new RegExp(`(^|[^a-z0-9])${escapeRe(l.city.toLowerCase())}([^a-z0-9]|$)`)));
    if (loc) draft.city = loc.city;

    const today = input.today;
    const dow = weekday(today);
    if (has(/\bhari ini\b/)) {
      draft.dateFrom = today;
      draft.dateTo = today;
    } else if (has(/\bbesok\b/)) {
      draft.dateFrom = addDays(today, 1);
      draft.dateTo = addDays(today, 1);
    } else if (has(/\bminggu depan\b/)) {
      const toMonday = ((8 - dow) % 7) || 7;
      draft.dateFrom = addDays(today, toMonday);
      draft.dateTo = addDays(today, toMonday + 6);
    } else if (has(/\bminggu ini\b/)) {
      draft.dateFrom = today;
      draft.dateTo = addDays(today, dow === 0 ? 0 : 7 - dow);
    } else if (has(/\b(akhir pekan|weekend)\b/)) {
      const toSat = dow === 0 ? -1 : 6 - dow;
      draft.dateFrom = addDays(today, Math.max(toSat, 0));
      draft.dateTo = addDays(today, toSat + 1);
    } else if (has(/\bbulan ini\b/)) {
      const [y, m] = today.split("-").map(Number);
      draft.dateFrom = today;
      draft.dateTo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    } else if (has(/\bbulan depan\b/)) {
      const [y, m] = today.split("-").map(Number);
      draft.dateFrom = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      draft.dateTo = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    }
    if (has(/\bterbaru\b/)) draft.sort = "newest";

    // Nothing understood: let F19 handle the words as a keyword search.
    if (!draft.category && !draft.city && !draft.dateFrom && !draft.sort) {
      draft.q = [...input.naturalLanguage].slice(0, 100).join("");
    }
    return draft;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
