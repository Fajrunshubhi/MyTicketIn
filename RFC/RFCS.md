# Indeks RFC TicketIn

## Tujuan

Dokumen ini adalah peta implementasi sekuensial TicketIn. Setiap RFC merupakan unit kerja kohesif yang harus selesai, diuji, dan memenuhi exit criteria sebelum RFC berikutnya dimulai.

**Jalur aktif MVP akademik:** implementasi wajib berjalan `RFC-001 → RFC-002 → ... → RFC-014 → UAT akademik`. Tidak ada RFC yang dikerjakan paralel atau dilompati.

**Jalur komersial deferred:** `RFC-015 → ... → RFC-020` hanya boleh diaktifkan setelah MVP akademik selesai dan **Commercial Entry Gate** disetujui eksplisit. Penambahan dokumen ini tidak mengubah prioritas Won’t Have pada MVP dan bukan persetujuan untuk menerima uang/data nyata.

Sumber kebenaran:

1. `../prd-improved.md`
2. `../features.md`
3. `../RULES.md`
4. RFC bernomor yang sedang dikerjakan

## Pendekatan Pemecahan Proyek

Urutan dibentuk dari dependensi data dan perilaku:

1. Normalisasi platform, database, environment, dan test harness.
2. Amankan identitas, sesi, role, serta ownership.
3. Sediakan audit dan analitik sebelum domain menghasilkan aksi sensitif.
4. Bangun organizer dan event sebagai sumber katalog.
5. Bangun inventori/order sebelum integrasi payment.
6. Terbitkan tiket hanya dari payment terverifikasi.
7. Bangun check-in hanya setelah tiket dan QR stabil.
8. Tambahkan dashboard/notifikasi dari data domain yang sudah terbentuk.
9. Lakukan hardening sistem utuh sebelum rilis.
10. Jika strategi komersial disetujui kemudian, lanjutkan legal/privacy → payment/ledger → settlement/payout → refund/dispute → security/fraud → reliability/launch.

## Grafik Dependensi Berarah

```text
RFC-001 Platform/Data
  └─> RFC-002 Identity/RBAC
       └─> RFC-003 Audit/Analytics
            └─> RFC-004 Organizer
                 └─> RFC-005 Event Authoring
                      └─> RFC-006 Event Lifecycle
                           └─> RFC-007 Catalog/Discovery
                                └─> RFC-008 Order/Inventory
                                     └─> RFC-009 Payment/Refund
                                          └─> RFC-010 E-ticket/QR
                                               └─> RFC-011 Check-in
                                                    └─> RFC-012 Dashboard
                                                         └─> RFC-013 Notification
                                                              └─> RFC-014 Hardening/Release
                                                                   └─> UAT/Rilis Akademik
                                                                        └─> Commercial Entry Gate
                                                                             └─> RFC-015 Legal/Privacy/KYC
                                                                                  └─> RFC-016 Production Payment/Ledger
                                                                                       └─> RFC-017 Settlement/Payout
                                                                                            └─> RFC-018 Refund/Dispute
                                                                                                 └─> RFC-019 Security/Fraud
                                                                                                      └─> RFC-020 Reliability/Launch
                                                                                                           └─> Commercial GA
```

Adjacency list:

- `RFC-001 → RFC-002`
- `RFC-002 → RFC-003`
- `RFC-003 → RFC-004`
- `RFC-004 → RFC-005`
- `RFC-005 → RFC-006`
- `RFC-006 → RFC-007`
- `RFC-007 → RFC-008`
- `RFC-008 → RFC-009`
- `RFC-009 → RFC-010`
- `RFC-010 → RFC-011`
- `RFC-011 → RFC-012`
- `RFC-012 → RFC-013`
- `RFC-013 → RFC-014`
- `RFC-014 → UAT/Rilis`
- `UAT/Rilis → Commercial Entry Gate`
- `Commercial Entry Gate → RFC-015`
- `RFC-015 → RFC-016`
- `RFC-016 → RFC-017`
- `RFC-017 → RFC-018`
- `RFC-018 → RFC-019`
- `RFC-019 → RFC-020`
- `RFC-020 → Commercial GA`

Pada jalur aktif, setiap RFC secara transitif bergantung pada seluruh RFC aktif bernomor lebih kecil. RFC-015–020 tetap tidak aktif sampai Commercial Entry Gate lulus; setelah diaktifkan, urutannya juga wajib sekuensial.

## Jalur Kritis

Seluruh rantai bersifat sekuensial, tetapi item berikut secara langsung memblokir demo nilai utama:

```text
RFC-001 → RFC-002 → RFC-004 → RFC-005 → RFC-006 → RFC-007
→ RFC-008 → RFC-009 → RFC-010 → RFC-011
```

Risiko tertinggi:

- **RFC-001:** migrasi dari prototype raw SQL/runtime DDL ke Prisma dan stack target.
- **RFC-002:** auth, account linking, role, dan object-level authorization.
- **RFC-008:** konkurensi inventori, expiry, dan idempotensi checkout.
- **RFC-009:** signature webhook, replay, callback terlambat, dan refund sandbox.
- **RFC-011:** kamera browser dan check-in atomik.

## Roadmap RFC

| Urutan | RFC | Fitur Utama | Predecessor | Successor | Kompleksitas |
|---:|---|---|---|---|---|
| 001 | [Platform dan Fondasi Data](RFC-001.md) | F54, F55, F61 | Tidak ada | RFC-002 | Tinggi |
| 002 | [Identitas, Sesi, dan RBAC](RFC-002.md) | F1–F5 | RFC-001 | RFC-003 | Tinggi |
| 003 | [Audit dan Analitik](RFC-003.md) | F45, F52 | RFC-002 | RFC-004 | Sedang–Tinggi |
| 004 | [Organizer dan Moderasi](RFC-004.md) | F7, F8 | RFC-003 | RFC-005 | Sedang |
| 005 | [Penulisan Event dan Tipe Tiket](RFC-005.md) | F9, F10, F15, F22 | RFC-004 | RFC-006 | Sedang–Tinggi |
| 006 | [Lifecycle Event dan Petugas](RFC-006.md) | F11–F14, F17 | RFC-005 | RFC-007 | Tinggi |
| 007 | [Katalog dan Discovery](RFC-007.md) | F18–F21 | RFC-006 | RFC-008 | Sedang |
| 008 | [Order, Inventori, Reservasi, dan Expiry](RFC-008.md) | F16, F23–F28, F59 | RFC-007 | RFC-009 | Sangat tinggi |
| 009 | [Payment dan Refund Sandbox](RFC-009.md) | F29–F33 | RFC-008 | RFC-010 | Sangat tinggi |
| 010 | [E-ticket, QR, dan Wallet](RFC-010.md) | F34–F36 | RFC-009 | RFC-011 | Tinggi |
| 011 | [Scanner dan Check-in](RFC-011.md) | F37–F41 | RFC-010 | RFC-012 | Sangat tinggi |
| 012 | [Dashboard dan Pelaporan](RFC-012.md) | F43, F44, F46–F48 | RFC-011 | RFC-013 | Sedang |
| 013 | [Notifikasi dan Pemulihan Akun](RFC-013.md) | F6, F49–F51 | RFC-012 | RFC-014 | Sedang |
| 014 | [Hardening dan Release Gate](RFC-014.md) | F53, F56–F58, F60, F62 | RFC-013 | UAT/Rilis | Tinggi |
| 015 | [Legal, Privasi, dan KYC/KYB](RFC-015.md) | Roadmap F63/F73; governance baru | RFC-014 + UAT + Commercial Entry Gate | RFC-016 | Tinggi, Deferred |
| 016 | [Production Payment dan Financial Ledger](RFC-016.md) | Roadmap F63/F73 | RFC-015 | RFC-017 | Sangat tinggi, Deferred |
| 017 | [Settlement, Payout, dan Reconciliation](RFC-017.md) | Roadmap F63 | RFC-016 | RFC-018 | Sangat tinggi, Deferred |
| 018 | [Refund, Chargeback, dan Dispute](RFC-018.md) | Roadmap F64 | RFC-017 | RFC-019 | Sangat tinggi, Deferred |
| 019 | [Production Security dan Fraud Prevention](RFC-019.md) | Commercial hardening | RFC-018 | RFC-020 | Sangat tinggi, Deferred |
| 020 | [Reliability, Support, dan Commercial Launch](RFC-020.md) | Launch governance F63/F64/F73 | RFC-019 | Commercial GA | Sangat tinggi, Deferred |

## Fase Implementasi

### Fase 1 — Fondasi Aman

- RFC-001: platform, data, environment, CI/test scaffold.
- RFC-002: identitas, sesi, RBAC, ownership.
- RFC-003: audit dan event analitik.

Exit fase: aplikasi memiliki persistence terversi, konfigurasi aman, auth/RBAC teruji, dan fasilitas audit.

### Fase 2 — Supply Event

- RFC-004: organizer dan moderasi.
- RFC-005: draft event dan tipe tiket.
- RFC-006: moderasi event, lifecycle, pembatalan, petugas.

Exit fase: organizer Approved dapat menghasilkan event Published yang valid.

### Fase 3 — Discovery dan Commerce Sandbox

- RFC-007: katalog, pencarian, filter, detail.
- RFC-008: inventori atomik, order, reservasi, expiry.
- RFC-009: payment gateway sandbox, webhook, rekonsiliasi, refund.

Exit fase: pembeli dapat membuat order tanpa overselling dan memperoleh status payment tepercaya.

### Fase 4 — Fulfillment dan Venue

- RFC-010: ticket issuance, QR, buyer wallet.
- RFC-011: scanner, validasi, atomic check-in, attempt log.

Exit fase: satu unit Paid menghasilkan satu tiket dan hanya satu check-in berhasil.

### Fase 5 — Operasional dan Rilis

- RFC-012: dashboard, ekspor, chart, pencarian admin.
- RFC-013: in-app/email/reminder dan password reset.
- RFC-014: error taxonomy, compatibility, accessibility, observability, backup, release gate.

Exit fase: seluruh Must Have lulus dan sistem siap UAT/rilis akademik.

### Fase 6 — Ekstensi Komersial Deferred

Fase ini **belum direncanakan untuk dieksekusi**:

- RFC-015: legal, privasi, hak subjek data, dan KYC/KYB.
- RFC-016: production payment dan financial ledger.
- RFC-017: settlement, payout, dan reconciliation.
- RFC-018: refund, chargeback, dan dispute.
- RFC-019: production security dan fraud prevention.
- RFC-020: reliability, support, dan commercial launch.

Entry criteria: RFC-001–014 dan UAT akademik selesai, strategi komersial disetujui, pemilik legal/finance/security/operations ditunjuk, serta Commercial Entry Gate memiliki bukti persetujuan.

## Matriks Kepemilikan Fitur

| RFC | Fitur yang Dimiliki | Jumlah |
|---|---|---:|
| RFC-001 | F54, F55, F61 | 3 |
| RFC-002 | F1, F2, F3, F4, F5 | 5 |
| RFC-003 | F45, F52 | 2 |
| RFC-004 | F7, F8 | 2 |
| RFC-005 | F9, F10, F15, F22 | 4 |
| RFC-006 | F11, F12, F13, F14, F17 | 5 |
| RFC-007 | F18, F19, F20, F21 | 4 |
| RFC-008 | F16, F23, F24, F25, F26, F27, F28, F59 | 8 |
| RFC-009 | F29, F30, F31, F32, F33 | 5 |
| RFC-010 | F34, F35, F36 | 3 |
| RFC-011 | F37, F38, F39, F40, F41 | 5 |
| RFC-012 | F43, F44, F46, F47, F48 | 5 |
| RFC-013 | F6, F49, F50, F51 | 4 |
| RFC-014 | F53, F56, F57, F58, F60, F62 | 6 |
| **Total in-scope MVP** | **61 fitur** | **61** |

F42 dan F63–F73 tetap **Won’t Have untuk MVP akademik**. RFC komersial tidak mengubah status tersebut. F63, F64, dan F73 hanya mendapat rancangan deferred pada RFC-015–020; F42 dan F65–F72 tetap tidak mempunyai RFC implementasi.

### Referensi Fitur Roadmap Komersial

| Fitur | RFC Deferred | Catatan |
|---|---|---|
| F63 — Transaksi nyata, settlement, payout | RFC-015, RFC-016, RFC-017, RFC-019, RFC-020 | Tidak aktif sebelum Commercial GA |
| F64 — Refund finansial produksi | RFC-018, RFC-019, RFC-020 | Tidak aktif sebelum Commercial GA |
| F73 — Monetisasi platform | RFC-015, RFC-016, RFC-020 | Model harga tetap membutuhkan keputusan terpisah |
| F42, F65–F72 | Tidak ada | Tetap di luar roadmap RFC saat ini |

## Hubungan Predecessor dan Successor

| RFC | Dibangun di Atas | Digunakan Oleh RFC Mendatang |
|---|---|---|
| RFC-001 | Prototype saat ini | Semua RFC |
| RFC-002 | DB/env/test foundation | Semua domain berizin |
| RFC-003 | Identity dan actor context | Moderasi, payment, check-in, dashboard |
| RFC-004 | RBAC dan audit | Event authoring |
| RFC-005 | Organizer Approved | Lifecycle, katalog, order |
| RFC-006 | Event draft/ticket type | Katalog dan order |
| RFC-007 | Published event | Checkout/order |
| RFC-008 | Catalog/ticket type | Payment dan ticket issuance |
| RFC-009 | Order/reservation | E-ticket |
| RFC-010 | Payment Paid | Check-in dan dashboard |
| RFC-011 | Ticket/QR | Dashboard/check-in analytics |
| RFC-012 | Seluruh data operasional | Notifications |
| RFC-013 | Trigger domain yang stabil | Hardening E2E |
| RFC-014 | Sistem lengkap | UAT akademik; menjadi baseline opsional RFC-015 |
| RFC-015 | RFC-001–014, UAT, Commercial Entry Gate | Production payment/ledger |
| RFC-016 | Legal/privacy/KYC dan keputusan merchant | Settlement/payout |
| RFC-017 | Ledger dan payable | Refund/chargeback/dispute |
| RFC-018 | Ledger, payout, refund/dispute | Security/fraud hardening |
| RFC-019 | Seluruh finance flow dan threat model | Reliability/commercial launch |
| RFC-020 | Seluruh RFC dan launch evidence | Commercial GA |

## Decision Gates

### Sebelum RFC-001 Selesai

- Konfirmasi target major stack dan hasil compatibility spike.
- Tentukan strategi migrasi data prototype: reset branch demo atau backfill user.
- Pastikan seluruh secret/fallback/credential prototype dicabut atau diputar.
- Tetapkan environment development, preview/test, dan production demo.

### Sebelum RFC-005

- Pilih object storage atau putuskan placeholder gambar untuk MVP.

### Sebelum RFC-008

- Pilih scheduler/cron yang tersedia pada hosting.

### Sebelum RFC-009

- Pilih payment gateway sandbox.
- Verifikasi QRIS, virtual account, e-wallet, signature webhook, event ID, dan refund sandbox.

### Sebelum RFC-013

- Pilih email provider atau terima in-app sebagai fallback.

### Sebelum Pilot Nyata

- Merchant of record, KYC, payout, fee, pajak, refund nyata, UU PDP, SLA, dan dukungan pelanggan. Keputusan ini tidak boleh diambil di RFC MVP.

### Commercial Entry Gate

RFC-015 hanya dapat dipindahkan dari `Deferred` setelah:

- Product Owner menyetujui strategi dan target komersial.
- Pemilik keputusan legal, privasi, finance, security, reliability, dan support ditunjuk.
- Anggaran, timeline, yurisdiksi, model bisnis, serta risk appetite ditetapkan.
- MVP akademik dan UAT selesai tanpa mengaktifkan credential produksi.

Selesainya RFC-015–019 tetap tidak mengizinkan live transaction. Aktivasi credential dan traffic nyata hanya dapat dilakukan melalui launch gate RFC-020.

## Aturan Eksekusi Setiap RFC

1. Jalankan prompt `implementation-prompt-RFC-NNN.md`.
2. Fase perencanaan prompt harus selesai dan disetujui sebelum kode ditulis.
3. Implementasikan hanya scope RFC aktif.
4. Jalankan test dan quality gate RFC aktif serta regression suite seluruh RFC sebelumnya.
5. Catat keputusan arsitektur dan penyimpangan.
6. Tandai RFC selesai hanya jika seluruh acceptance criteria dan Definition of Done lulus.
7. Mulai RFC berikutnya setelah exit criteria RFC aktif terverifikasi.
8. Jangan menjalankan prompt RFC-015–020 selama statusnya Deferred.

## Daftar Prompt

- [Prompt RFC-001](implementation-prompt-RFC-001.md)
- [Prompt RFC-002](implementation-prompt-RFC-002.md)
- [Prompt RFC-003](implementation-prompt-RFC-003.md)
- [Prompt RFC-004](implementation-prompt-RFC-004.md)
- [Prompt RFC-005](implementation-prompt-RFC-005.md)
- [Prompt RFC-006](implementation-prompt-RFC-006.md)
- [Prompt RFC-007](implementation-prompt-RFC-007.md)
- [Prompt RFC-008](implementation-prompt-RFC-008.md)
- [Prompt RFC-009](implementation-prompt-RFC-009.md)
- [Prompt RFC-010](implementation-prompt-RFC-010.md)
- [Prompt RFC-011](implementation-prompt-RFC-011.md)
- [Prompt RFC-012](implementation-prompt-RFC-012.md)
- [Prompt RFC-013](implementation-prompt-RFC-013.md)
- [Prompt RFC-014](implementation-prompt-RFC-014.md)
- [Prompt RFC-015](implementation-prompt-RFC-015.md) — Deferred
- [Prompt RFC-016](implementation-prompt-RFC-016.md) — Deferred
- [Prompt RFC-017](implementation-prompt-RFC-017.md) — Deferred
- [Prompt RFC-018](implementation-prompt-RFC-018.md) — Deferred
- [Prompt RFC-019](implementation-prompt-RFC-019.md) — Deferred
- [Prompt RFC-020](implementation-prompt-RFC-020.md) — Deferred

## Catatan Template Prompt

`implementation-prompt-template.md` disimpan dari teks yang diberikan pengguna. Prompt turunan hanya mengganti tiga placeholder yang diizinkan. Referensi `@FEATURES.md` di dalam template dipertahankan persis walaupun file sumber repository bernama `features.md`.
