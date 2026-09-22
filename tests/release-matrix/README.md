# Release / UAT matrix (RFC-014)

Default deny. Must Have tidak boleh NOT_APPLICABLE.

| ID | Bukti otomatis | Hasil PR | Candidate |
| --- | --- | --- | --- |
| F53-E2E-001 | catalog + envelope + UI recovery | PASS | PASS |
| F53-SEC-002 | 500 tanpa stack di Write/recover | PASS | PASS |
| F56-COMP-001 | Playwright chromium 360/768/1440 | PASS parsial | perlu Edge/Firefox/Safari |
| F56-DEVICE-002 | Chrome Android kamera | FAIL sampai bukti perangkat | FAIL |
| F57-A11Y-001 | skip link, label, reduced motion, lang=id | PASS parsial | axe/manual penuh |
| F58-INT-001 | logger redaction tests | PASS | PASS |
| F58-OPS-002 | ops health + runbook | PASS | PASS |
| F60-REC-001 | restore-drill.ts + runbook | FAIL tanpa snapshot | FAIL |
| F62-CI-001 | ci.yml memblokir format/test | PASS | PASS |
| F62-ROLL-002 | rollback.yml | PASS prosedur | perlu drill artifact |
| NFR-PERF-001 | profil 15 menit | FAIL | FAIL |
| REL-F20-001 | catalog e2e/unit | PASS | PASS |
| REL-F46-001 | reporting CSV tests | PASS | PASS |
| REL-F49-51-001 | notifications unit | PASS | PASS |
| REL-F74-001 | reporting recommendation tests | PASS | PASS |
| REL-F76-77-001 | AI disabled/fake + fail-fast env | PASS | PASS |
| REL-F76-77-SEC-002 | untrusted input / no SQL | PASS | PASS |
| REL-F65-CONC-001 | order seat tests | PASS | PASS |
| REL-F75-CONC-001 / REFUND-002 | order loyalty tests | PASS | PASS |

Promotion production-demo diblokir selama ada FAIL (lihat `release.yml`).
