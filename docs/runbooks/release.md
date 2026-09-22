# Release (F62)

Candidate dibangun sekali. Artifact digest sama dipromosikan.

## PR gate

`ci.yml`: gofmt/vet/test/build, lint/typecheck/unit, verify-migrations, secret-scan, npm audit high.

## Candidate gate

`release.yml` (workflow_dispatch): E2E, matrix F20/F46/F49–F51/F65/F74–F77, restore-drill bila `BACKUP_SNAPSHOT_AT`, smoke live/ready.

Manifest `release-manifest.json`: schemaVersion, releaseId, gitSha, gateResults PASS|FAIL, sandboxOnly=true. Tanpa env/secret.

Must Have tidak boleh NOT_APPLICABLE. Default deny: tanpa bukti = FAIL.

Goose, bukan Prisma. `prisma migrate` tidak dipakai.

Promote production-demo hanya setelah Product Owner menyetujui digest. Lalu smoke transaksi sandbox terkontrol.
