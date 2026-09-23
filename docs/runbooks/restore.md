# Restore drill (F60)

RPO baseline: 24 jam. Target: cabang/database isolasi, **bukan** menimpa production-demo.

1. Catat `BACKUP_SNAPSHOT_AT` (RFC3339) dari snapshot Neon/host.
2. `npx tsx scripts/restore-drill.ts` — gagal jika snapshot >24 jam atau tidak ada.
3. Provision database isolasi (Neon branch atau Postgres lokal baru).
4. Restore snapshot ke target isolasi.
5. `npm run migrate` maju bila perlu (additive saja; URL unpooled).
6. Checksum non-PII: jumlah users/orders/tickets (bukan email/token).
7. Invariant SQL: kuota tidak oversold, payment reference unik, Paid unit = ticket, max satu check-in sukses/tiket, audit immutable.
8. Smoke read-only: `/api/health/ready`, katalog.
9. Hapus target sesuai approval.

Jangan unggah dump berisi PII ke artifact CI. Evidence: `restore-report.json` tanpa credential.
