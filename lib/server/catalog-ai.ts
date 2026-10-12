import { hitRateLimit } from "@/lib/server/rate-limit";
import { listFilters } from "@/lib/server/catalog";
import {
  llmConfigFromEnv,
  OllamaCloudCatalogFilterParser,
  ollamaCloudConfigFromEnv,
  OpenAiCompatibleCatalogFilterParser,
} from "@/lib/server/catalog-filter-llm";
import {
  AiOutputInvalid,
  buildResult,
  DeterministicCatalogFilterParser,
  fallbackResult,
  normalizeNaturalText,
  RULE_BASED_NOTICE,
  validateDraft,
  type AiCatalogFilterPort,
  type CatalogFilterOptions,
  type NaturalFilterResult,
} from "@/lib/server/catalog-filter";

// Outer guard only; the adapter enforces its own (5 s remote, up to 15 s for a local model) inside this limit.
const PROVIDER_TIMEOUT_MS = 16_000;

type Deps = {
  port?: AiCatalogFilterPort | null;
  loadOptions?: () => Promise<CatalogFilterOptions>;
  /** Throws when the caller exceeded the AI quota. */
  checkQuota?: (ip: string) => Promise<void>;
  now?: () => Date;
  timeoutMs?: number;
};

/**
 * Second line of defence when the model is unavailable, invalid, or over quota: the free, offline rule parser goes
 * through the same validator. Returns null unless it produced real structure, so plain keyword search stays the last resort.
 */
async function ruleBasedFallback(
  text: string,
  options: CatalogFilterOptions,
  now: Date,
): Promise<NaturalFilterResult | null> {
  try {
    const out = await new DeterministicCatalogFilterParser().parseCatalogFilter(buildInput(text, options, now));
    const draft = validateDraft(out, options);
    if (!draft.category && !draft.city && !draft.province && !draft.dateFrom && !draft.sort) return null;
    return buildResult({ sort: "soonest", ...draft }, "RULE_BASED_FALLBACK", RULE_BASED_NOTICE);
  } catch {
    return null;
  }
}

function buildInput(text: string, options: CatalogFilterOptions, now: Date) {
  return {
    naturalLanguage: text,
    locale: "id-ID" as const,
    today: jakartaToday(now),
    timezone: "Asia/Jakarta" as const,
    allowedCategories: options.categories,
    allowedLocations: options.locations,
    outputSchemaVersion: "catalog-filter.v1" as const,
  };
}

/** Reason codes are internal only; the client always receives the same safe notice. */
export type FallbackReason =
  | "NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "OUTPUT_INVALID"
  | "PROVIDER_UNAVAILABLE"
  | "OPTIONS_UNAVAILABLE";

/**
 * `fake` = deterministic rule-based parser (no network). `openai-compatible` = any OpenAI-style chat endpoint.
 * Anything missing or invalid yields null, which makes the service use the keyword-search fallback.
 */
export function configuredPort(env: NodeJS.ProcessEnv = process.env): AiCatalogFilterPort | null {
  if (env.AI_CATALOG_FILTER_ENABLED !== "true") return null;
  if (env.AI_PROVIDER === "fake") return new DeterministicCatalogFilterParser();
  if (env.AI_PROVIDER === "openai-compatible") {
    const cfg = llmConfigFromEnv(env);
    return cfg ? new OpenAiCompatibleCatalogFilterParser(cfg) : null;
  }
  if (env.AI_PROVIDER === "ollama-cloud") {
    const cfg = ollamaCloudConfigFromEnv(env);
    return cfg ? new OllamaCloudCatalogFilterParser(cfg) : null;
  }
  return null;
}

function jakartaToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

async function defaultQuota(ip: string): Promise<void> {
  // Scope "ai" is already allowed by the auth_rate_limits CHECK; the key prefix separates this from poster scans.
  await hitRateLimit("ai", `catalog-min:${ip}`, 10, 60);
  await hitRateLimit("ai", `catalog-day:${ip}`, 50, 86_400);
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Natural language -> validated catalog filters. Never throws for provider problems (falls back to keyword search);
 * only invalid input (400) escapes. Input text, prompts, and output are never logged.
 */
export async function resolveNaturalFilter(
  raw: string,
  ip: string,
  deps: Deps = {},
): Promise<{ result: NaturalFilterResult; reason?: FallbackReason; detail?: string }> {
  const text = normalizeNaturalText(raw);
  const port = deps.port === undefined ? configuredPort() : deps.port;
  const now = (deps.now ?? (() => new Date()))();

  let options: CatalogFilterOptions;
  try {
    options = await (deps.loadOptions ?? listFilters)();
  } catch {
    return { result: fallbackResult(text), reason: "OPTIONS_UNAVAILABLE" };
  }

  // AI disabled: no provider call and no cost, so the offline rule parser needs no quota.
  if (!port) {
    const rule = await ruleBasedFallback(text, options, now);
    // AI is off by choice, so don't claim it is "unavailable"; just say what happened to the text.
    const plain = { ...fallbackResult(text), notice: "Tidak ada filter yang dikenali; teks dicari sebagai kata kunci judul." };
    return { result: rule ?? plain, reason: "NOT_CONFIGURED" };
  }

  try {
    await (deps.checkQuota ?? defaultQuota)(ip);
  } catch {
    return { result: (await ruleBasedFallback(text, options, now)) ?? fallbackResult(text), reason: "RATE_LIMITED" };
  }

  try {
    const out = await withTimeout(port.parseCatalogFilter(buildInput(text, options, now)), deps.timeoutMs ?? PROVIDER_TIMEOUT_MS);
    const draft = validateDraft(out, options);
    return { result: buildResult({ sort: "soonest", ...draft }, "AI") };
  } catch (err) {
    const invalid = err instanceof AiOutputInvalid;
    return {
      result: (await ruleBasedFallback(text, options, now)) ?? fallbackResult(text),
      reason: invalid ? "OUTPUT_INVALID" : "PROVIDER_UNAVAILABLE",
      // Short machine code only (e.g. provider_http_404, timeout, unknown_category); never text, prompt, or vendor body.
      detail: err instanceof Error ? err.message.slice(0, 60) : undefined,
    };
  }
}
