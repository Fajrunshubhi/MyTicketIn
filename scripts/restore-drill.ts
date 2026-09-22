const raw = process.env.BACKUP_SNAPSHOT_AT || "";
if (!raw) {
  console.error("BACKUP_SNAPSHOT_AT missing; restore drill blocked (RPO 24h unknown)");
  process.exit(1);
}
const at = Date.parse(raw);
if (Number.isNaN(at)) {
  console.error("BACKUP_SNAPSHOT_AT invalid");
  process.exit(1);
}
const ageH = (Date.now() - at) / 36e5;
if (ageH > 24) {
  console.error("backup older than 24h", ageH.toFixed(1));
  process.exit(1);
}
console.log("restore-drill precheck PASS ageHours=", ageH.toFixed(2));
console.log("Lanjut runbook docs/runbooks/restore.md: restore ke branch isolasi, bukan production-demo.");
