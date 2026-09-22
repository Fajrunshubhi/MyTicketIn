# Rollback

1. Hentikan write bila data dicurigai rusak.
2. `ROLLBACK_ARTIFACT_DIGEST=<digest> npx tsx scripts/rollback-verify.ts`
3. Deploy artifact sebelumnya (binary Go + UI Next yang sama digest).
4. Jangan `goose down` destruktif. Skema harus kompatibel satu versi maju.
5. `/api/health/ready` lalu smoke read-only.
6. Jika data rusak: restore isolasi per `restore.md`, approval Product Owner.

Incident: catat correlation ID, bukan payload/token.
