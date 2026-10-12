// Connectivity check for Ollama Cloud, going through the same parser class the catalog search uses.
// Run: npm run ollama-check   (reads OLLAMA_API_KEY from .env.local; the key is never printed)
import { ollamaCloudConfigFromEnv, OllamaCloudCatalogFilterParser } from "../lib/server/catalog-filter-llm";

const cfg = ollamaCloudConfigFromEnv();
if (!cfg) {
  console.error("OLLAMA_API_KEY is empty. Fill it in .env.local after OLLAMA_API_KEY= and run again.");
  process.exit(1);
}

const STATUS_HINT: Record<string, string> = {
  provider_http_401: "401: OLLAMA_API_KEY is wrong or missing.",
  provider_http_402: "402: this model is not in your Ollama plan.",
  provider_http_404: "404: the model name is wrong (see https://ollama.com/api/tags).",
  provider_http_429: "429: you reached an Ollama usage limit.",
};

async function main() {
  const parser = new OllamaCloudCatalogFilterParser({ ...cfg!, timeoutMs: 30_000 });
  console.log(`model: ${cfg!.model}`);
  const plain = await parser.chat([{ role: "user", content: "Balas dalam satu kalimat bahasa Indonesia: mengapa langit berwarna biru?" }]);
  console.log("chat reply:", plain);

  const filter = await parser.parseCatalogFilter({
    naturalLanguage: "konser musik di Bandung minggu ini",
    locale: "id-ID",
    today: new Date().toISOString().slice(0, 10),
    timezone: "Asia/Jakarta",
    allowedCategories: ["Musik", "Olahraga", "Seminar"],
    allowedLocations: [{ city: "Bandung", province: "Jawa Barat" }],
    outputSchemaVersion: "catalog-filter.v1",
  });
  console.log("catalog filter reply:", filter);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : "unknown";
  console.error(STATUS_HINT[msg] ?? `Request failed (${msg}).`);
  process.exit(1);
});
