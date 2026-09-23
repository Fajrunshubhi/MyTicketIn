const api = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:3000";

async function main() {
  const live = await fetch(`${api}/api/health/live`, { cache: "no-store" });
  if (!live.ok) {
    console.error("live failed", live.status);
    process.exit(1);
  }
  const liveJson = (await live.json()) as { status?: string };
  if (liveJson.status !== "ok") {
    console.error("live body", liveJson);
    process.exit(1);
  }
  const ready = await fetch(`${api}/api/health/ready`, { cache: "no-store" });
  if (!ready.ok) {
    console.error("ready failed", ready.status);
    process.exit(1);
  }
  console.log("smoke live+ready ok");
}

main().catch((err) => {
  console.error("smoke failed");
  console.error(err instanceof Error ? err.message : "error");
  process.exit(1);
});
