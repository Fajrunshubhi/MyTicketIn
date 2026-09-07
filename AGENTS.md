# AGENTS.md — Panduan Coding Agent TicketIn

Dokumen ini berlaku untuk seluruh repository. Gunakan sebagai petunjuk operasional ringkas; detail kebutuhan dan standar tetap berada pada dokumen sumber.

## 1. Misi Proyek

TicketIn adalah aplikasi web tiket event tatap muka untuk pembeli, organizer, petugas check-in, dan admin.

Target aktif adalah **MVP akademik**:

- Payment gateway sandbox dan data uji.
- Tidak menerima uang nyata.
- Tidak mengaktifkan payout atau refund finansial produksi.
- Deployment belum tersedia dan provider harus non-Vercel.
- Implementasi mengikuti RFC-001–RFC-014 secara ketat dan sekuensial.

RFC-015–RFC-020 adalah rancangan komersial **Deferred**. Jangan merencanakan atau mengimplementasikannya sebelum Commercial Entry Gate disetujui eksplisit.

## 2. Sumber Kebenaran

Jika terdapat konflik, ikuti urutan:

1. Instruksi terbaru pengguna/Product Owner.
2. `prd-improved.md`.
3. `features.md`.
4. RFC aktif di `RFC/RFC-NNN.md`.
5. `architecture.md` dan `architecture-essentials.md`.
6. `RULES.md`.
7. `PRD.md` sebagai konteks historis.
8. Kode saat ini.

Gunakan `RFC/RFCS.md` untuk menentukan urutan dan dependensi. Jangan menganggap kode prototype sebagai requirement jika bertentangan dengan dokumen yang lebih tinggi.

## 3. Kondisi Repository

Sampai terdapat bukti RFC-001 selesai, perlakukan repository sebagai prototype pre-RFC:

- Next.js 14, React 18, TypeScript 5, dan Tailwind CSS 3.
- Auth username/password serta Google tersedia sebagian.
- Persistence masih menggunakan raw SQL dan fallback JSON.
- Prisma schema belum menjadi source of truth runtime.
- Runtime DDL, seed credential, ID berbasis waktu, dan fallback secret harus dianggap technical/security debt.
- Domain event, order, payment, ticket, dan check-in belum tersedia.

Jangan menyatakan suatu fitur selesai hanya karena UI atau sebagian prototype sudah ada. Verifikasi terhadap acceptance criteria fitur dan RFC.

## 4. Mode Kerja Agent

### Sebelum Mengubah Kode

1. Identifikasi RFC dan ID fitur yang diminta.
2. Baca RFC aktif, bagian terkait dalam `features.md`, `RULES.md`, dan kode terdampak.
3. Pastikan seluruh predecessor RFC telah selesai.
4. Jelaskan scope, file terdampak, migration, endpoint, test, dan risiko.
5. Tanyakan hanya keputusan yang benar-benar memblokir atau berdampak pada produk, keamanan, data, biaya, atau deployment.
6. Jangan menulis kode jika prompt RFC masih berada pada fase perencanaan yang menunggu persetujuan.

### Saat Mengubah Kode

- Implementasikan hanya scope RFC/permintaan aktif.
- Buat perubahan terkecil yang lengkap, aman, dan dapat diuji.
- Pertahankan perubahan pengguna yang tidak terkait.
- Perbaiki komponen yang sudah ada sebelum membuat duplikat.
- Jangan melakukan major upgrade bersama perubahan fitur.
- Jangan menambah package atau provider SDK tanpa kebutuhan dan decision gate.
- Jangan mengubah PRD, prioritas MoSCoW, invariant, atau state machine secara sepihak.

### Setelah Mengubah Kode

1. Jalankan format/lint, typecheck, test terkait, dan build sesuai risiko.
2. Jalankan regression test seluruh RFC sebelumnya jika kontrak bersama berubah.
3. Periksa security, authorization, error path, accessibility, dan mobile behavior.
4. Laporkan ID fitur, file berubah, test yang dijalankan, hasil, asumsi, dan risiko tersisa.
5. Jangan menyatakan selesai jika validasi belum dijalankan tanpa menjelaskan alasannya.

## 5. Arsitektur Wajib

Gunakan modular monolith:

```text
Presentation → Application Service → Domain → Ports
                                           ↑
                       Repository/Provider Adapters
```

Aturan boundary:

- Page, Client Component, Server Action, dan Route Handler harus tipis.
- Application service mengorkestrasi use case dan transaction.
- Domain berisi invariant serta transisi status dan tidak mengimpor framework.
- Repository mengenkapsulasi Prisma/PostgreSQL.
- Provider adapter mengenkapsulasi payment, storage, email, analytics, dan scheduler.
- Module lain menggunakan public application contract, bukan infrastructure internal.

Gunakan React Server Components secara default. `"use client"` hanya untuk interaksi browser seperti scanner, form dinamis, dan dialog.

## 6. Struktur Kode Target

```text
app/
components/
  ui/
  shared/
modules/
  auth/
  audit/
  organizers/
  events/
  catalog/
  inventory/
  orders/
  payments/
  refunds/
  tickets/
  check-in/
  reporting/
  notifications/
lib/
  db/
  env/
  errors/
  logger/
  security/
prisma/
  schema.prisma
  migrations/
tests/
  integration/
  e2e/
```

Di dalam module, gunakan `domain/`, `application/`, `infrastructure/`, dan `ui/` hanya jika ada implementasi nyata. Jangan membuat folder atau abstraction placeholder.

## 7. Konvensi

- Komponen dan file React: `PascalCase`.
- Route/folder dan file non-komponen: `kebab-case`.
- Fungsi/variabel: `camelCase`.
- Type/interface/class: `PascalCase`.
- Konstanta dan environment variable: `UPPER_SNAKE_CASE`.
- Database: `snake_case`, dipetakan melalui Prisma.
- Kode dan error code: Bahasa Inggris.
- UI, pesan pengguna, dan dokumentasi produk: Bahasa Indonesia.
- TypeScript `strict`; jangan gunakan `any` atau menonaktifkan pemeriksaan untuk melewati error.
- Komentar menjelaskan alasan, invariant, atau trade-off—bukan mengulang kode.

## 8. Data dan Invariant

PostgreSQL/Neon adalah satu-satunya source of truth.

Dilarang:

- Persistence JSON/file lokal.
- Runtime `CREATE TABLE` atau perubahan skema dalam request.
- ID berbasis `Date.now()`.
- Uang menggunakan floating point.
- Hard-delete transaksi, ticket, audit, atau check-in.

Gunakan:

- Prisma 7.10 dan migration terversi.
- CUID/UUID non-predictable.
- Integer Rupiah.
- UTC/`TIMESTAMPTZ`.
- Snapshot harga/nama pada OrderItem.
- Transaction, unique/check constraint, dan conditional update.

Invariant wajib:

1. `paidQuantity + reservedQuantity <= quota`.
2. Counter inventori tidak negatif.
3. Satu external payment reference hanya untuk satu Payment.
4. Webhook provider diproses efektif satu kali.
5. Satu unit order Paid menghasilkan tepat satu Ticket.
6. Satu Ticket memiliki paling banyak satu check-in berhasil.
7. Event Cancelled tidak kembali Published.
8. Organizer hanya mengakses data event miliknya.

## 9. API dan State

- Validasi seluruh boundary menggunakan Zod.
- Periksa session, role, capability, ownership, dan status domain pada server.
- Gunakan typed error dan envelope standar dari `RULES.md`.
- Gunakan pagination untuk koleksi yang dapat tumbuh.
- Gunakan idempotency key untuk checkout, webhook, dan operasi sensitif.
- URL adalah source of truth untuk filter/search/page.
- PostgreSQL adalah source of truth untuk inventory/order/payment/ticket.
- Optimistic update dilarang untuk inventory, payment, refund, dan check-in.
- Katalog publik boleh di-cache dengan invalidation; state transaksi tidak boleh.

## 10. Security Non-Negotiables

- Jangan hardcode secret, credential, password demo, atau role admin.
- Aplikasi harus fail-fast jika secret wajib tidak tersedia.
- Jangan memakai dangerous automatic OAuth account linking.
- Hash password secara asynchronous dengan adaptive cost.
- Terapkan rate limit pada auth, checkout, webhook, scanner, dan reset password.
- Verifikasi signature webhook dari payload yang benar.
- QR harus opaque, tidak memuat PII, dan divalidasi pada server.
- Jangan log password, cookie, token OAuth, token QR, atau connection string.
- Terapkan RBAC serta object-level authorization pada setiap mutasi/query sensitif.
- Jangan memakai credential payment produksi pada MVP.
- Jangan melakukan operasi git/database destruktif tanpa persetujuan.

Jika menemukan credential bocor, broken authorization, atau invariant finansial yang dapat dilanggar, hentikan pekerjaan terkait dan laporkan sebagai blocker.

## 11. Testing dan Quality Gates

Minimal:

- Unit test untuk policy, perhitungan, dan transisi status.
- Integration test PostgreSQL untuk transaction dan authorization.
- E2E untuk alur lintas module.
- Contract test serta deterministic fake untuk provider.
- Regression test untuk setiap bug fix.

Coverage:

- Global: minimal 80% lines/functions dan 75% branches.
- Inventory, order, payment, ticket, check-in, dan authorization: minimal 90% branches.

Kasus kritis:

- Checkout bersamaan pada tiket terakhir.
- Checkout retry/idempotency.
- Webhook invalid, duplikat, terlambat, dan out-of-order.
- Ticket issuance tepat satu kali.
- Dua scan tiket yang sama secara bersamaan.
- Akses lintas organizer.
- Expiry beradu dengan webhook sukses.

Merge dilarang jika lint, typecheck, test terkait, migration check, atau build gagal.

## 12. UX, Aksesibilitas, dan Kinerja

- Target WCAG 2.1 AA pada alur utama.
- Semantic HTML, keyboard access, focus state, label, dan field error wajib.
- Hasil scanner tidak hanya dibedakan dengan warna.
- Buyer wallet dan scanner diprioritaskan untuk mobile.
- Dukung dua versi terbaru Chrome, Edge, Firefox, dan Safari.
- Scanner wajib diuji pada Chrome Android.
- Katalog/detail p95 ≤ 2 detik.
- Check-in p95 ≤ 1,5 detik.
- Overselling dan check-in berhasil ganda harus nol.

## 13. Deployment dan Provider

- Deployment belum tersedia.
- Vercel bukan target.
- Provider non-Vercel dipilih pada RFC-001.
- Provider harus mendukung Node.js/Next.js penuh, HTTPS, webhook, secret, health check, migration, logging, dan rollback.
- Scheduler harus eksternal atau disediakan platform; timer in-process dilarang.
- Development, Preview/Test, dan Production Demo harus terisolasi.
- Jangan memilih payment, storage, scheduler, email, atau analytics SDK sebelum gate terkait disetujui.

## 14. Urutan RFC

Jalur aktif:

```text
RFC-001 → RFC-002 → ... → RFC-014 → UAT akademik
```

Jalur komersial:

```text
Commercial Entry Gate → RFC-015 → ... → RFC-020 → Commercial GA
```

RFC-015–020 tetap Deferred. F42 dan F65–F72 tetap tidak memiliki RFC implementasi.

## 15. Definition of Done

Fitur dianggap selesai jika:

1. Acceptance criteria dan ID fitur terpenuhi.
2. Seluruh predecessor dan dependency telah tersedia.
3. Happy path, failure path, authorization, dan edge case ditangani.
4. Test proporsional tersedia dan lulus.
5. Invariant database tetap terjaga.
6. Logging/analytics tidak membocorkan data sensitif.
7. UI yang relevan telah diperiksa untuk mobile dan accessibility.
8. Migration, dokumentasi, dan rollback diperbarui.
9. Tidak ada TODO, placeholder, hardcoded secret, debug code, atau defect kritis.

## 16. Format Handoff

Gunakan format ringkas:

```text
RFC/Fitur:
Hasil:
File utama:
Validasi:
Keputusan/asumsi:
Risiko atau pekerjaan tersisa:
```

Handoff harus faktual. Jangan mengklaim test, build, deployment, atau acceptance criteria telah lulus jika belum diverifikasi.
