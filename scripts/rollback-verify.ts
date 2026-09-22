const digest = process.env.ROLLBACK_ARTIFACT_DIGEST || "";
if (!digest) {
  console.error("ROLLBACK_ARTIFACT_DIGEST required for rollback verify");
  process.exit(1);
}
if (digest.length < 12) {
  console.error("digest too short");
  process.exit(1);
}
console.log("rollback-verify precheck PASS digest=", digest.slice(0, 12), "…");
console.log("Gunakan docs/runbooks/rollback.md; jangan jalankan goose Down destruktif.");
