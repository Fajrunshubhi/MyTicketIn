# Incident

1. Ambil `X-Correlation-Id` dari UI/error envelope.
2. Cari log JSON `correlationId` — jangan buka cookie/token.
3. Klasifikasi: VALIDATION / AUTH / CONFLICT / RATE_LIMIT / PROVIDER / INTERNAL.
4. Payment/provider: cek status order di server; jangan klaim gagal sebelum webhook.
5. Loyalty/kursi: satu pelanggaran invariant memblokir rilis.
6. Tutup setelah ready, smoke, dan tidak ada kebocoran log.
