# Observability

Owner: platform. Severity: high jika health 503 tiga kali atau error rate >5%/5m.

## Sinyal

- Log JSON stdout: timestamp, level, service, env, correlationId, route, outcome, durationMs.
- Redaksi: password, cookie, token, secret, DSN, prompt/poster, QR, ledger.
- Metrik in-process 5 menit + query agregat: webhook gagal, expiry lag, outbox, reminder, check-in p95, rekomendasi p95, loyalty invariant.

## Alert minimum

| Kondisi | Mitigasi |
| --- | --- |
| error >5%/5m | Cek `/api/health/ready`, log `outcome=error` |
| job lag >5m | POST job scheduler dengan `X-Scheduler-Secret` |
| email gagal | In-app tetap; retry outbox; jangan rollback domain |
| reminder lag | `send-event-reminders` lalu `dispatch-notifications` |
| scan p95 >1,5s | Turunkan beban scanner, cek DB |
| backup unknown/stale | Jalankan restore runbook |
| loyalty invariant >0 | Hentikan write, incident |

Retensi log 14 hari. Akses terbatas. Tidak ada PII di dashboard.

Escalation: Product Owner akademik. Tutup setelah ready+smoke lulus.
