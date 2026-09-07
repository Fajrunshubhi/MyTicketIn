# Aturan Pengembangan TicketIn

Dokumen ini adalah pedoman teknis proyek untuk pengembang dan bantuan AI. Aturan berlaku pada seluruh repository kecuali dokumen kebutuhan menyatakan pengecualian.

## 1. Konteks Proyek

TicketIn adalah aplikasi web responsif untuk event tatap muka di Indonesia. Empat persona utamanya adalah **pembeli**, **organizer**, **petugas check-in**, dan **admin**. Alur inti meliputi moderasi event, inventori tiket, checkout, pembayaran sandbox, penerbitan QR, serta check-in satu kali.

MVP bersifat akademik:

- Gunakan payment gateway **sandbox** dan data uji.
- Jangan menerima uang nyata atau mengaktifkan credential produksi.
- Settlement, payout, refund finansial nyata, KYC produksi, dan monetisasi berada di luar cakupan.
- Target pengerjaan adalah 12 minggu dengan jalur kritis yang ditentukan di `features.md`.

## 2. Hierarki Sumber Kebenaran

Jika dokumen bertentangan, gunakan urutan berikut:

1. Keputusan terbaru yang dikonfirmasi pengguna/Product Owner.
2. `prd-improved.md`.
3. `features.md`, termasuk MoSCoW, acceptance criteria, dan dependensi.
4. `PRD.md` sebagai riwayat awal.
5. `RULES.md` untuk cara implementasi, bukan untuk mengubah kebutuhan produk.
6. Kode saat ini.

Jangan menafsirkan kode lama sebagai kebutuhan jika bertentangan dengan PRD. Catat konflik dan minta keputusan jika memengaruhi scope, data, keamanan, pembayaran, atau deadline.

## 3. Stack Teknologi

### 3.1 Baseline dan Kebijakan Versi

Versi target di bawah adalah versi stabil yang diverifikasi pada **7 September 2026**. Versi prerelease/RC/beta tidak boleh digunakan untuk jalur kritis.

| Area | Teknologi Target | Versi |
|---|---|---:|
| Runtime | Node.js Active LTS | 24.20.0 |
| Package manager | npm | 12.0.2 |
| Web framework | Next.js App Router | 16.3.4 |
| UI runtime | React / React DOM | 19.2.8 |
| Bahasa | TypeScript | 7.0.2 |
| Styling | Tailwind CSS | 4.3.3 |
| Database | PostgreSQL pada Neon | Versi terkelola Neon |
| ORM dan migrasi | Prisma ORM / Client | 7.10.0 |
| Driver serverless | `@neondatabase/serverless` | 1.1.0 |
| Autentikasi | NextAuth | 4.24.15 |
| Password hashing | `bcryptjs` | 3.0.3 |
| Validasi | Zod | 4.5.4 |
| Generator QR | `qrcode` | 1.5.4 |
| Scanner QR | `@zxing/browser` | 0.2.1 |
| Structured logging | Pino | 10.3.1 |
| Unit/integration test | Vitest | 5.0.0 |
| End-to-end test | Playwright | 1.63.0 |
| Lint | ESLint / `eslint-config-next` | 10.10.0 / 16.3.4 |
| Format | Prettier | 3.9.6 |
| Script runner | `tsx` | 4.23.13 |

Catatan Prisma: versi `8.0.0-rc.*` adalah prerelease dan tidak boleh dipakai. Pin Prisma CLI dan Client ke **7.10.0** sampai rilis Prisma 8 non-prerelease dan kompatibilitasnya telah diuji.

### 3.2 Aturan Upgrade

- Repository saat ini memakai Next.js 14, React 18, Tailwind 3, dan pola akses data lama. **Jangan melakukan major upgrade diam-diam.**
- Buat perubahan migrasi stack terpisah dari implementasi fitur.
- Sebelum upgrade, buat compatibility spike untuk NextAuth, Prisma/Neon, Tailwind, build, dan deployment.
- Pin versi exact pada dependensi jalur kritis dan commit `package-lock.json`.
- Patch/minor upgrade tetap harus melewati build, typecheck, test, dan smoke test.
- Jangan memakai package baru jika platform/API standar atau dependensi yang sudah disetujui mencukupi.

### 3.3 Integrasi yang Belum Dipilih

- Jangan memilih atau memasang SDK payment gateway, object storage, email, analytics, atau scheduler sebelum decision gate disetujui.
- Bungkus layanan pihak ketiga dalam adapter agar domain tidak tergantung langsung pada SDK provider.
- Selalu sediakan fake/simulator deterministic untuk automated test.

## 4. Pola Arsitektur

### 4.1 Bentuk Sistem

Gunakan **modular monolith** berbasis domain pada satu aplikasi Next.js. Jangan membuat microservice untuk MVP.

Lapisan dependensi:

`UI/Route Handler → Application Service → Domain → Repository/Provider Adapter`

Aturan:

- Page, Server Action, dan Route Handler harus tipis.
- Aturan bisnis berada di application/domain service, bukan komponen React.
- Repository mengenkapsulasi database.
- Provider adapter mengenkapsulasi payment, email, object storage, analytics, dan scheduler.
- Domain tidak boleh mengimpor React, Next.js, atau SDK provider.
- Satu use case penting harus dapat diuji tanpa menjalankan browser.

### 4.2 Struktur Folder

Gunakan struktur berikut untuk kode baru:

```text
app/
  (public)/
  (buyer)/
  organizer/
  admin/
  api/
    webhooks/
components/
  ui/
  shared/
modules/
  auth/
  organizers/
  events/
  inventory/
  orders/
  payments/
  tickets/
  check-in/
  notifications/
  audit/
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

Di dalam satu module, gunakan `domain/`, `application/`, `infrastructure/`, dan `ui/` hanya jika kompleksitas membutuhkannya. Hindari folder kosong atau abstraksi satu kali tanpa manfaat.

### 4.3 Server dan Client

- Gunakan React Server Components secara default.
- Tambahkan `"use client"` hanya untuk state/interaksi browser, misalnya scanner, form interaktif, dan dialog.
- Jangan mengirim secret, token QR mentah, atau data admin ke Client Component.
- Fetch data pada server untuk halaman awal; gunakan client fetch hanya untuk interaksi dinamis.
- Webhook dan endpoint provider wajib memakai Route Handler.
- Server Action boleh digunakan untuk form internal jika tetap memanggil application service yang sama.

## 5. Konvensi Kode

### 5.1 Penamaan

| Elemen | Konvensi | Contoh |
|---|---|---|
| Komponen React dan file komponen | PascalCase | `EventCard.tsx` |
| Route/folder Next.js | kebab-case | `ticket-types/` |
| File non-komponen | kebab-case | `create-order.ts` |
| Fungsi/variabel | camelCase | `reserveInventory` |
| Type/interface/class | PascalCase | `OrderStatus` |
| Konstanta global | UPPER_SNAKE_CASE | `MAX_TICKETS_PER_TYPE` |
| Environment variable | UPPER_SNAKE_CASE | `DATABASE_URL` |
| Tabel/kolom database | snake_case | `inventory_reservations` |
| Test | nama sumber + `.test`/`.spec` | `reserve-inventory.test.ts` |

Gunakan istilah domain konsisten: `organizer`, `event`, `ticketType`, `order`, `payment`, `inventoryReservation`, `ticket`, `checkInAttempt`, dan `refund`.

### 5.2 TypeScript

- `strict` wajib aktif.
- Jangan memakai `any`; gunakan `unknown` lalu lakukan narrowing.
- Jangan gunakan non-null assertion kecuali invariant telah dibuktikan dan diberi alasan.
- Gunakan discriminated union/enum untuk status domain dan pemeriksaan transisi exhaustive.
- Pisahkan DTO, model domain, dan bentuk record database.
- Fungsi domain harus kecil, deterministik, dan memiliki nama sesuai intent.
- Ekspor hanya API module yang diperlukan; hindari barrel file yang menimbulkan circular dependency.

### 5.3 Gaya dan Keterbacaan

- Utamakan kode eksplisit dibanding abstraksi cerdas.
- Satu fungsi mengerjakan satu tanggung jawab.
- Hindari nesting dalam; gunakan guard clause.
- Komentar menjelaskan **mengapa**, bukan mengulang apa yang dilakukan kode.
- Jangan menyimpan kode mati, komentar kode lama, atau duplikasi besar.
- Jangan menambah TODO/FIXME/placeholders pada hasil yang dinyatakan selesai.

## 6. Data dan Database

### 6.1 Sumber Data

- PostgreSQL/Neon adalah satu-satunya source of truth.
- Gunakan Prisma untuk model, query domain, transaksi, dan migrasi.
- Jangan mencampur raw SQL dan Prisma untuk invariant yang sama tanpa alasan terdokumentasi.
- Raw SQL hanya untuk operasi yang tidak dapat diekspresikan aman melalui ORM, harus parameterized dan diuji.
- Jangan gunakan JSON/file lokal sebagai fallback persistence.
- Jangan membuat atau mengubah tabel saat runtime (`CREATE TABLE IF NOT EXISTS` dilarang di request path).

### 6.2 Migrasi dan Seed

- Semua perubahan skema melalui migration terversi.
- Migrasi harus diuji pada database test/preview sebelum demo.
- Migrasi destruktif menggunakan pola expand → migrate/backfill → contract.
- Seed hanya berjalan eksplisit pada development/test.
- Jangan menyertakan akun produksi, password tetap, atau credential lemah dalam source code.

### 6.3 Representasi Data

- Gunakan ID non-predictable, misalnya UUID/CUID; jangan gunakan `Date.now()` sebagai ID.
- Simpan uang sebagai integer Rupiah, bukan floating point.
- Simpan waktu sebagai `TIMESTAMPTZ`/UTC dan tampilkan sesuai zona waktu event.
- Order item menyimpan snapshot nama, harga, dan kuantitas saat checkout.
- Reservasi inventori adalah entitas terpisah; Ticket hanya dibuat setelah Order Paid.
- Data transaksi, tiket, audit, dan check-in tidak boleh di-hard-delete.

### 6.4 Invarian Wajib

1. `paidQuantity + activeReservationQuantity <= quota`.
2. Satu external payment reference hanya terkait satu Payment.
3. Satu unit order Paid menghasilkan tepat satu Ticket.
4. Satu Ticket memiliki paling banyak satu check-in berhasil.
5. Organizer hanya dapat mengakses data event miliknya.
6. Event Cancelled tidak dapat kembali Published.

Jaga invariant dengan constraint/transaksi database, bukan hanya validasi UI.

## 7. API dan Manajemen State

### 7.1 Kontrak API

- Validasi parameter, query, header, dan body menggunakan Zod pada boundary.
- Gunakan status HTTP yang tepat dan respons error konsisten:

```json
{
  "error": {
    "code": "INVENTORY_UNAVAILABLE",
    "message": "Jumlah tiket yang tersedia tidak mencukupi.",
    "correlationId": "req_...",
    "fieldErrors": {}
  }
}
```

- Pesan pengguna berbahasa Indonesia; `code` stabil dan berbahasa Inggris.
- Jangan mengekspos stack trace, SQL, provider payload, atau secret.
- Mutasi sensitif harus memeriksa session, role, ownership, dan status domain.
- Pagination wajib untuk daftar yang dapat tumbuh.
- Dokumentasikan request, response, auth, idempotency, dan error code endpoint.

### 7.2 Idempotensi dan Konkurensi

- Checkout menerima idempotency key; key sama dan payload sama mengembalikan order yang sama.
- Webhook menyimpan provider event ID unik dan aman diputar ulang.
- Job expiry aman dijalankan ulang dan oleh lebih dari satu worker.
- Reservasi inventori memakai transaksi/conditional update.
- Check-in memakai atomic transition `Unused → Used`.
- Callback sukses setelah expiry tidak boleh otomatis menerbitkan tiket.

### 7.3 State UI

- URL/query parameter adalah source of truth untuk pencarian, filter, pagination, dan tab yang dapat dibagikan.
- Server/database adalah source of truth untuk order, payment, inventory, dan ticket.
- Gunakan React state lokal untuk interaksi sementara.
- Jangan menambah global client state library tanpa kebutuhan lintas halaman yang terbukti.
- Optimistic update dilarang untuk payment, inventory, refund, dan check-in.

## 8. Integrasi Pembayaran dan QR

### 8.1 Payment Sandbox

- Hanya credential sandbox yang diperbolehkan.
- UI dan data harus berlabel **SANDBOX/UJI**.
- Verifikasi signature webhook menggunakan raw body bila provider mensyaratkan.
- Status Order tidak boleh berubah menjadi Paid berdasarkan redirect/browser callback saja.
- Pisahkan status Order dan Payment.
- Jangan mencatat full provider payload jika berisi PII/secret.
- Gunakan adapter, misalnya `PaymentGateway`, dengan operasi create payment, verify webhook, map status, dan sandbox refund.

### 8.2 QR dan Check-in

- Token QR memiliki minimal 128-bit entropy atau payload bertanda tangan.
- QR tidak memuat PII.
- Simpan hash token jika lookup dan provider QR memungkinkan.
- Validasi final selalu dilakukan server.
- Jangan cache halaman atau response QR secara publik.
- Scan ganda bersamaan hanya boleh menghasilkan satu keberhasilan.
- Kehilangan koneksi tidak boleh menandai tiket Used secara lokal.

## 9. Keamanan

- Secret wajib tersedia; aplikasi harus fail fast jika secret produksi hilang.
- Dilarang membuat fallback secret hardcoded.
- Nonaktifkan dangerous account linking kecuali kepemilikan email diverifikasi dengan desain yang disetujui.
- Hash password secara asynchronous dengan cost yang diuji pada runtime target.
- Terapkan rate limit pada login, registrasi, reset password, checkout, scanner, dan webhook.
- Terapkan CSRF protection sesuai mekanisme NextAuth/Next.js.
- Validasi redirect URL dan cegah open redirect.
- Terapkan RBAC dan object-level authorization pada server.
- Gunakan least privilege untuk database dan provider.
- Secret hanya berada pada environment/secrets manager; jangan di-commit atau dikirim ke client.
- Jalankan dependency/security scan sebelum rilis.
- Temuan Critical/High harus nol sebelum merge/rilis.

Jika menemukan credential, fallback secret, seed password, atau akses lintas tenant yang tidak aman, hentikan fitur terkait dan laporkan sebagai blocker keamanan.

## 10. Error Handling dan Logging

- Gunakan typed domain/application errors.
- Tangani error pada boundary; jangan menelan exception dengan `catch {}` kosong.
- Bedakan validation, authentication, authorization, conflict, unavailable, provider, dan internal error.
- Error provider tidak boleh membuat transaksi lokal setengah selesai.
- Log berbentuk structured JSON dengan level dan correlation ID.
- Log event penting: auth abuse, moderasi, checkout, webhook, expiry, ticket issuance, refund, dan check-in.
- Jangan log password, cookie/session token, OAuth token, QR token, connection string, atau PII yang tidak diperlukan.
- Health check tidak boleh mengungkap host, credential, atau stack trace.
- Error jaringan pada scanner/payment tidak boleh ditampilkan sebagai tiket/payment invalid.

## 11. Kinerja dan Optimasi

Profil uji MVP:

- Event dengan 5.000 tiket.
- 50 pembeli checkout bersamaan.
- 10 scanner bersamaan.
- Load test minimal 15 menit.

Target:

- Respons server katalog/detail p95 ≤ 2 detik.
- Validasi QR online p95 ≤ 1,5 detik.
- Overselling dan check-in ganda = 0.

Strategi:

- Pilih kolom eksplisit; hindari `SELECT *` dan overfetching.
- Tambahkan indeks berdasarkan query nyata: status/publikasi event, owner, expiry order, external payment ID, token hash, dan status ticket.
- Gunakan pagination; jangan mengambil seluruh peserta/order.
- Cache hanya data publik yang aman dan tetapkan invalidasi saat event berubah.
- Jangan cache inventory/payment/check-in sebagai source of truth.
- Optimalkan gambar melalui `next/image` dan object storage.
- Ukur sebelum mengoptimalkan; sertakan bukti benchmark untuk perubahan performa.

## 12. Pengujian

### 12.1 Kewajiban

- Setiap bug fix memiliki regression test.
- Setiap Must Have memiliki test yang dapat ditelusuri ke ID fitur `F*`.
- Unit test untuk aturan murni dan transisi status.
- Integration test dengan PostgreSQL untuk transaksi, ownership, webhook, dan check-in.
- E2E test untuk alur organizer → admin → pembeli → payment sandbox → ticket → check-in.
- Jangan mock database pada test konkurensi/invariant.
- Adapter pihak ketiga harus memiliki contract test dan deterministic fake.

### 12.2 Target Coverage

- Global: ≥ 80% lines/functions dan ≥ 75% branches.
- Module kritis inventory, order, payment, ticket, check-in, dan authorization: ≥ 90% branches.
- Coverage tidak menggantikan skenario acceptance dan concurrent test.

### 12.3 Skenario Wajib

- Sisa satu tiket dengan checkout bersamaan.
- Checkout retry/idempotency.
- Webhook sukses, gagal, expired, signature salah, duplikat, dan terlambat.
- Satu payment tidak menerbitkan tiket ganda.
- Dua scan tiket yang sama secara bersamaan.
- Wrong event, Used, Cancelled, token tidak dikenal, dan pengguna tanpa izin.
- Pembatalan event dengan order Paid dan Ticket Unused/Used.
- Restore backup dan smoke test pasca-deploy.

Test harus deterministic, terisolasi, dapat diulang, dan membersihkan data sendiri.

## 13. Aksesibilitas dan Responsif

- Target WCAG 2.1 AA untuk alur utama.
- Semua form memiliki label, instruksi, error terkait field, dan focus management.
- Semua aksi utama dapat digunakan dengan keyboard.
- Jangan mengandalkan warna saja; hasil scanner membutuhkan teks/ikon yang jelas.
- Gunakan semantic HTML sebelum ARIA.
- Hormati reduced motion.
- Uji katalog, checkout, ticket wallet, dan scanner pada viewport mobile.
- Mendukung dua versi terbaru Chrome, Edge, Firefox, Safari; scanner wajib diuji di Chrome Android.
- Tidak boleh ada horizontal overflow yang menghalangi aksi.

## 14. Dokumentasi

- README menjelaskan setup, environment variable tanpa nilai secret, migrasi, seed, test, dan deployment.
- Tambahkan `.env.example` dengan placeholder aman.
- Dokumentasikan setiap integrasi provider, webhook, retry, dan cara menjalankan simulator.
- Keputusan arsitektur penting ditulis sebagai ADR singkat.
- Perubahan skema menyertakan alasan dan dampak migrasi.
- API publik/internal yang dipakai lintas module memiliki kontrak terdokumentasi.
- Komentar dan dokumentasi harus tetap sinkron dengan kode.

## 15. Prioritas Implementasi

### 15.1 Jalur Kritis

Kerjakan dalam urutan berikut:

1. **Fondasi:** F1–F8, F45, F61.
2. **Event dan katalog:** F9–F21.
3. **Order dan inventori:** F23–F28, F59.
4. **Payment sandbox:** F29–F32.
5. **Ticket dan check-in:** F34–F40.
6. **Operasional/kualitas:** F43–F45, F49, F52–F62.
7. **Should Have:** F6, F14, F20, F22, F33, F41, F46, F50.
8. **Could Have:** F13, F17, F47, F48, F51.

Fitur Won’t Have F42 dan F63–F73 tidak boleh diimplementasikan pada MVP tanpa perubahan scope eksplisit.

### 15.2 Quality Gates

Sebelum merge:

- Lint, format check, typecheck, dan test terkait lulus.
- Acceptance criteria fitur terpenuhi.
- Tidak ada TODO, placeholder, secret, debug log, atau dead code baru.
- Migrasi dan rollback ditinjau jika skema berubah.
- Security dan ownership test tersedia untuk endpoint sensitif.

Sebelum rilis:

- Build, seluruh automated test, security scan, dan smoke test lulus.
- Must Have lulus 100%.
- Defect blocker/critical dan security Critical/High = 0.
- Concurrent overselling/double-scan test lulus.
- Backup restore drill berhasil.
- Hasil performa, usability, dan SUS didokumentasikan.

## 16. Aturan untuk Bantuan AI

### 16.1 Sebelum Mengubah Kode

- Baca `prd-improved.md`, fitur terkait di `features.md`, dan kode yang terdampak.
- Sebutkan ID fitur yang sedang dikerjakan.
- Periksa dependency dan jalur kritis.
- Jangan mengubah requirement, prioritas, atau aturan bisnis secara sepihak.
- Jangan melakukan refactor luas atau major upgrade dalam perubahan fitur.
- Pertahankan perubahan pengguna yang tidak terkait.

### 16.2 Saat Mengimplementasikan

- Buat perubahan terkecil yang lengkap dan aman.
- Ikuti lapisan arsitektur dan reuse application service.
- Implementasikan happy path, failure path, authorization, logging, dan test.
- Jangan membuat mock/fake aktif pada production runtime.
- Jangan menambahkan fallback diam-diam untuk database, secret, payment, atau auth.
- Jangan menonaktifkan type/lint/test rule hanya agar build lulus.
- Jangan menjalankan operasi destruktif pada git/database tanpa persetujuan.

### 16.3 Menangani Ambiguitas

Wajib bertanya sebelum melanjutkan jika ketidakpastian mengubah:

- Scope MoSCoW atau acceptance criteria.
- Model data/invariant/transisi status.
- Provider, biaya, uang nyata, refund, payout, atau pajak.
- Auth, permission, PII, retensi, atau kepatuhan.
- Migrasi destruktif, deadline, atau kebutuhan infrastruktur berbayar.

Untuk detail lokal berisiko rendah:

1. Pilih opsi paling sederhana yang konsisten dengan PRD.
2. Catat asumsi di ringkasan perubahan.
3. Jangan mengubah perilaku produk tanpa persetujuan.

### 16.4 Standar Komunikasi

Setelah menyelesaikan tugas, laporkan secara ringkas:

- ID fitur dan hasil yang selesai.
- File utama yang diubah.
- Test/check yang dijalankan beserta hasil.
- Asumsi, risiko, dan decision gate yang tersisa.
- Hal yang tidak dapat diselesaikan beserta penyebabnya.

Jangan menyatakan selesai jika test belum dijalankan tanpa menjelaskan alasannya.

## 17. Definition of Done untuk Satu Fitur

Satu fitur dianggap selesai hanya jika:

1. Acceptance criteria di `features.md` terpenuhi.
2. UI, server, database, authorization, error, dan edge case yang relevan ditangani.
3. Test unit/integration/E2E yang proporsional tersedia dan lulus.
4. Logging/analytics tidak membocorkan data sensitif.
5. Aksesibilitas dan mobile behavior diverifikasi jika memiliki UI.
6. Dokumentasi dan migrasi diperbarui jika diperlukan.
7. Tidak ada placeholder, TODO, hardcoded secret, atau known critical defect.
8. Perubahan dapat di-deploy dan di-rollback dengan aman.
## 18. Larangan Eksplisit
- Jangan memakai uang, credential, atau endpoint payment produksi pada MVP.
- Jangan membuat tabel saat runtime atau menyimpan data aplikasi ke file JSON.
- Jangan memakai ID berbasis timestamp untuk entitas bisnis.
- Jangan hardcode secret, password demo, role admin, harga, atau status.
- Jangan percaya harga, role, ownership, atau status dari client.
- Jangan menerbitkan tiket sebelum webhook sukses terverifikasi.
- Jangan memperbarui inventory/check-in tanpa transaksi atomik.
- Jangan menyimpan token QR mentah di log/analytics.
- Jangan menggunakan prerelease dependency pada jalur kritis.
- Jangan mengimplementasikan fitur Won’t Have tanpa persetujuan perubahan scope.
