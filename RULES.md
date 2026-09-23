# Aturan Pengembangan MyTicketIn

Dokumen ini adalah pedoman teknis proyek untuk pengembang dan bantuan AI. Aturan berlaku pada seluruh repository kecuali dokumen kebutuhan menyatakan pengecualian.

## 1. Konteks Proyek

MyTicketIn adalah aplikasi web responsif untuk event tatap muka di Indonesia. Empat persona utamanya adalah **pembeli**, **organizer**, **petugas check-in**, dan **admin**. Alur inti meliputi moderasi event, inventori tiket dalam tiga mode (`GENERAL_ADMISSION`, `ZONED`, `RESERVED_SEATING`), discovery melalui filter/rekomendasi/pencarian bahasa alami, checkout dengan loyalitas per organizer, pembayaran sandbox, penerbitan QR, check-in satu kali, ekspor, email/reminder, serta AI poster-ke-draft dengan kendali manusia.

MVP bersifat akademik:

- Gunakan payment gateway **sandbox** dan data uji.
- Jangan menerima uang nyata atau mengaktifkan credential produksi.
- Settlement, payout, refund finansial nyata, KYC produksi, dan monetisasi berada di luar cakupan.
- Target pengerjaan adalah 12 minggu dengan jalur kritis yang ditentukan di `features.md`.
- Baseline `prd-improved.md` 2.2 berisi 77 fitur: 57 Must, 5 Should, 4 Could, dan 11 Won’t; cakupan aktif MVP adalah 66 fitur.
- F20, F46, F49, F50, F51, F65, dan F74–F77 adalah Must Have. F42, F63–F64, serta F66–F73 tetap Won’t Have.

## 2. Hierarki Sumber Kebenaran

Jika dokumen bertentangan, gunakan urutan berikut:

1. Keputusan terbaru yang dikonfirmasi pengguna/Product Owner.
2. `prd-improved.md`.
3. `features.md`, termasuk MoSCoW, acceptance criteria, dan dependensi.
4. RFC aktif di `RFC/RFC-NNN.md`, dengan urutan dan dependensi dari `RFC/RFCS.md`.
5. `architecture.md` dan `architecture-essentials.md`.
6. `RULES.md` untuk cara implementasi, bukan untuk mengubah kebutuhan produk.
7. `PRD.md` versi 1.0 sebagai riwayat yang telah digantikan oleh `prd-improved.md` 2.2.
8. Kode saat ini.

Jangan menafsirkan kode lama sebagai kebutuhan jika bertentangan dengan PRD. Catat konflik dan minta keputusan jika memengaruhi scope, data, keamanan, pembayaran, atau deadline.

## 3. Stack Teknologi

### 3.1 Baseline dan Kebijakan Versi

Versi target di bawah adalah versi stabil yang diverifikasi pada **19 September 2026**. Versi prerelease/RC/beta tidak boleh digunakan untuk jalur kritis.

| Area | Teknologi Target | Versi |
|---|---|---:|
| Runtime transaksi (target RFC-021) | Next.js Route Handlers + PostgreSQL | 14.x (repo saat ini) |
| Runtime transaksi (transisi) | Go API di `backend/` | 1.27.1 |
| HTTP API (transisi) | chi | v5 |
| Driver PostgreSQL (transisi) | pgx | v5 |
| Driver PostgreSQL (target) | `@neondatabase/serverless` atau `pg` | sesuai RFC-021 |
| Migrasi | goose SQL di `/migrations`, runner Node `npm run migrate` | v3 compatible |
| Query typed (transisi) | sqlc | CLI pin pada RFC-001 |
| Logging API (transisi) | `log/slog` | stdlib |
| Password hashing (transisi) | `golang.org/x/crypto/bcrypt` | modul x/crypto terkini stabil |
| Password hashing (target) | bcryptjs / bcrypt async | — |
| Presentation UI | Next.js App Router | 14.x (jangan major upgrade diam-diam) |
| UI runtime | React / React DOM | 18.x |
| Bahasa UI | TypeScript | 5.x |
| Styling | Tailwind CSS | 3.x |
| Package manager UI | npm | 10+ |
| Runtime UI | Node.js | 24 (CI) / lokal sesuai mesin |
| Database | PostgreSQL pada Neon | Versi terkelola Neon |
| Autentikasi | Sesi server-side cookie `mti_session` (RFC-002); bukan NextAuth | — |
| Validasi UI | Zod | — |
| Validasi API | DTO Go (transisi); Zod di Route Handler (target) | — |
| Generator QR | sesuai RFC-010 | — |
| Scanner QR | `@zxing/browser` | 0.2.1 |
| Unit/integration API (transisi) | `go test` | stdlib |
| Unit/integration API (target) | Vitest + tes SQL | — |
| Unit UI | Vitest | 3.x |
| End-to-end | Playwright | 1.55.x |
| Lint/format Go (transisi) | gofmt, go vet | — |
| Lint/format UI | ESLint | 8.x |

Prisma dan NextAuth **bukan** stack target. `backend/` Go **jangan dihapus** sampai RFC-021 §5 lulus.

### 3.2 Aturan Upgrade

- Repository saat ini memakai Next.js 14, React 18, Tailwind 3, dan API Go transisi. **Jangan melakukan major upgrade diam-diam.**
- Buat perubahan migrasi stack terpisah dari implementasi fitur domain (RFC-021).
- Sebelum menghapus Go, ikuti checklist paritas RFC-021.
- Pin versi exact pada dependensi jalur kritis; commit `go.sum` dan `package-lock.json`.
- Patch/minor upgrade tetap harus melewati build, test, dan smoke test.
- Jangan memakai package baru jika stdlib Go atau dependensi yang sudah disetujui mencukupi.

### 3.3 Integrasi yang Belum Dipilih

- Jangan memilih atau memasang SDK payment gateway, object storage, email, analytics, scheduler, atau AI sebelum decision gate terkait disetujui.
- Kontrak AI wajib provider-neutral; pemilihan model/provider, retensi, redaksi, rate limit, quota/biaya, timeout, dan observability diputuskan melalui gate.
- Bungkus layanan pihak ketiga dalam adapter agar domain tidak tergantung langsung pada SDK provider.
- Selalu sediakan fake/simulator deterministic untuk automated test.

## 4. Pola Arsitektur

### 4.1 Bentuk Sistem

Gunakan **modular monolith** berbasis domain: satu binary Go untuk API/webhook/job, satu aplikasi Next.js untuk presentation. Jangan membuat microservice untuk MVP. Jangan membagi domain inventory/order/payment ke proses terpisah.

Lapisan dependensi:

`UI Next.js → HTTP JSON → Handler Go → Application Service → Domain → Repository/Provider Adapter`

Aturan:

- Page, Client Component, dan BFF Next.js harus tipis; dilarang menjalankan transaksi inventori/order/payment di Server Action.
- Aturan bisnis berada di application/domain Go, bukan komponen React.
- Repository mengenkapsulasi PostgreSQL melalui sqlc/pgx.
- Provider adapter mengenkapsulasi payment, email, object storage, analytics, scheduler, dan AI.
- Domain tidak boleh mengimpor `net/http`, chi, pgx, React, Next.js, atau SDK provider.
- Satu use case penting harus dapat diuji dengan `go test` tanpa browser.

### 4.2 Struktur Folder

Gunakan struktur berikut untuk kode baru:

```text
backend/
  cmd/api/
  cmd/worker/          # hanya saat RFC scheduler
  internal/platform/
  internal/modules/
    auth/
    organizers/
    events/
    inventory/
    orders/
    payments/
    tickets/
    check-in/
    loyalty/
    ...
  migrations/
  queries/
app/                   # presentation Next.js (transisi dari prototype)
components/
  ui/
  shared/
tests/
  e2e/
```

Di dalam satu module, gunakan `domain/`, `application/`, `infrastructure/`, dan `ui/` hanya jika kompleksitas membutuhkannya. Hindari folder kosong atau abstraksi satu kali tanpa manfaat.

### 4.3 Server dan Client

- Gunakan React Server Components secara default untuk halaman.
- Tambahkan `"use client"` hanya untuk state/interaksi browser, misalnya scanner, form interaktif, dan dialog.
- Jangan mengirim secret, token QR mentah, atau data admin ke Client Component.
- Fetch data halaman melalui Route Handler / `lib/server`; jangan query PostgreSQL dari Client Component.
- Webhook dan job dilayani Route Handler Next (`/api/webhooks/...`, `/api/internal/jobs/...`).
- Form Next.js memanggil `/api` same-origin; jangan menaruh invariant di Server Action.

## 5. Konvensi Kode

### 5.1 Penamaan

| Elemen | Konvensi | Contoh |
|---|---|---|
| Komponen React dan file komponen | PascalCase | `EventCard.tsx` |
| Route/folder Next.js | kebab-case | `ticket-types/` |
| File Go | lowercase / domain | `create_order.go` atau `order.go` |
| File TS non-komponen | kebab-case | `create-order.ts` |
| Fungsi/variabel Go unexported | camelCase | `reserveInventory` |
| Fungsi/tipe Go exported | PascalCase | `ReserveInventory` |
| Fungsi/variabel TypeScript | camelCase | `formatRupiah` |
| Type/interface/class | PascalCase | `OrderStatus` |
| Konstanta global | UPPER_SNAKE_CASE | `MAX_TICKETS_PER_TYPE` |
| Environment variable | UPPER_SNAKE_CASE | `DATABASE_URL` |
| Tabel/kolom database | snake_case | `inventory_reservations` |
| Test | nama sumber + `.test`/`.spec` | `reserve-inventory.test.ts` |

Gunakan istilah domain konsisten: `organizer`, `event`, `ticketType`, `venueSection`, `seatMapAsset`, `eventSeat`, `order`, `payment`, `inventoryReservation`, `ticket`, `checkInAttempt`, dan `refund`.

### 5.2 Go dan TypeScript

- Go: tidak ada `panic` untuk kontrol alur bisnis; bungkus error dengan kode domain.
- Jangan menonaktifkan `errcheck`; setiap error I/O/database harus ditangani.
- TypeScript `strict` wajib aktif pada UI.
- Jangan memakai `any`; gunakan `unknown` lalu lakukan narrowing.
- Jangan gunakan non-null assertion kecuali invariant telah dibuktikan dan diberi alasan.
- Gunakan discriminated union/enum untuk status domain dan pemeriksaan transisi exhaustive.
- Pisahkan DTO, model domain, dan bentuk record database.
- Fungsi domain harus kecil, deterministik, dan memiliki nama sesuai intent.
- Ekspor hanya API module yang diperlukan; hindari circular dependency.

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
- Gunakan file goose di `/migrations` dan `npm run migrate`; query/transaksi di `lib/server` (selama transisi, sqlc+pgx di `backend/` tetap referensi).
- `DATABASE_URL` pooled untuk request; `DATABASE_URL_UNPOOLED` untuk migrasi.
- Dilarang Prisma, GORM auto-migrate, dan raw SQL yang di-concatenate.
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
- Order item menyimpan snapshot nama, harga, kuantitas, kategori/area, dan label kursi saat checkout.
- Reservasi inventori adalah entitas terpisah; Ticket hanya dibuat setelah Order Paid.
- Data transaksi, tiket, audit, dan check-in tidak boleh di-hard-delete.
- Poin dan Rupiah selalu integer. Ledger loyalitas bersifat append-only; koreksi menggunakan entry kompensasi, bukan update/delete histori.
- Saldo poin diproyeksikan dari ledger dan reservasi aktif per pasangan pembeli–organizer; jangan menyimpan satu saldo global lintas organizer.
- Mode inventori event (`GENERAL_ADMISSION`, `ZONED`, `RESERVED_SEATING`) tidak boleh diubah setelah commerce dimulai.
- `EventSeat` menyimpan identitas kursi; hold 15 menit dan tiket Paid merujuk kursi yang sama.

### 6.4 Invarian Wajib

1. `paidQuantity + activeReservationQuantity <= quota`.
2. Satu external payment reference hanya terkait satu Payment.
3. Satu unit order Paid menghasilkan tepat satu Ticket.
4. Satu Ticket memiliki paling banyak satu check-in berhasil.
5. Organizer hanya dapat mengakses data event miliknya.
6. Event Cancelled tidak dapat kembali Published.
7. Poin terisolasi per buyer–organizer, tidak dapat ditransfer/diuangkan, tidak kedaluwarsa, dan tidak memiliki nilai tunai.
8. Earn adalah 1 poin per Rp1.000 net paid; redeem adalah Rp10 per poin dan maksimum 20% total order, seluruhnya dengan aritmetika integer.
9. Pembuatan order dan reservasi poin atomik; Failed/Expired/Cancelled melepaskan reservasi tepat satu kali.
10. Transisi pertama ke Paid mengubah reservasi poin menjadi debit ledger dan memberi earn tepat satu kali.
11. Refund Completed membalik earned points; full Refund Completed memulihkan redeemed points melalui entry kompensasi.
12. Rekomendasi dan hasil AI search hanya memuat event Published yang akan datang.
13. AI tidak boleh menghasilkan/menjalankan SQL, membuat event, auto-submit, auto-approve, atau auto-publish.
14. Setiap event memiliki tepat satu mode inventori; request yang tidak sesuai mode ditolak dengan `INVENTORY_MODE_MISMATCH`.
15. Satu `EventSeat` paling banyak memiliki satu hold aktif atau satu Ticket Paid; konflik kursi memakai `SEAT_UNAVAILABLE`.

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

Error mode-aware tambahan: `SEAT_UNAVAILABLE` ketika kursi sudah di-hold atau Paid; `INVENTORY_MODE_MISMATCH` ketika payload checkout/authoring tidak sesuai mode event. API checkout, ketersediaan, dan issuance bersifat mode-aware.

- Pesan pengguna berbahasa Indonesia; `code` stabil dan berbahasa Inggris.
- Jangan mengekspos stack trace, SQL, provider payload, atau secret.
- Mutasi sensitif harus memeriksa session, role, ownership, dan status domain.
- Pagination wajib untuk daftar yang dapat tumbuh.
- Dokumentasikan request, response, auth, idempotency, dan error code endpoint.

### 7.2 Idempotensi dan Konkurensi

- Checkout menerima idempotency key; key sama dan payload sama mengembalikan order yang sama.
- Webhook menyimpan provider event ID unik dan aman diputar ulang.
- Job expiry aman dijalankan ulang dan oleh lebih dari satu worker.
- Reservasi inventori dan hold kursi memakai transaksi/conditional update.
- Check-in memakai atomic transition `Unused → Used`.
- Callback sukses setelah expiry tidak boleh otomatis menerbitkan tiket.
- Reservasi/release/konversi poin menggunakan transaction, conditional update, dan idempotency reference yang unik.
- Retry webhook/refund/job tidak boleh menggandakan loyalty earn, debit, reversal, atau restore.

### 7.3 State UI

- URL/query parameter adalah source of truth untuk pencarian, filter, pagination, dan tab yang dapat dibagikan.
- Server/database adalah source of truth untuk event, rekomendasi, loyalty, order, payment, inventory, dan ticket.
- AI search hanya memetakan bahasa alami ke schema filter tervalidasi; repository membangun parameterized query ke PostgreSQL.
- Gunakan React state lokal untuk interaksi sementara.
- Jangan menambah global client state library tanpa kebutuhan lintas halaman yang terbukti.
- Optimistic update dilarang untuk payment, inventory, seat hold, refund, dan check-in.

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

## 8.3 Loyalitas Sandbox

- Saldo dan reservasi di-scope oleh `buyerId + organizerId`; object-level authorization wajib pada setiap read/mutation.
- Hitung earned points dari net paid setelah redeem dengan integer division yang terdokumentasi.
- Batasi redeem pada nilai terendah antara saldo tersedia dan 20% total order; validasi ulang di dalam transaksi.
- Pending order hanya menahan poin melalui record reservasi. Failed, Expired, dan Cancelled melepaskannya; Paid mengonversinya tepat satu kali.
- Refund berstatus selain Completed tidak mengubah ledger final. Refund Completed membuat reversal earned; full completed refund juga membuat restore redeemed.
- Poin tidak memiliki expiry, cash value, transfer, payout, atau penggunaan lintas organizer pada MVP.

## 8.4 AI Produk

- F76 hanya menghasilkan saran draft terstruktur. Organizer harus meninjau, memilih field, menerapkan, dan menyimpan secara eksplisit.
- F76 tidak boleh auto-submit, auto-approve, atau auto-publish dalam kondisi apa pun.
- F77 hanya menghasilkan filter dari allowlist. AI tidak mendapat credential/database tool dan tidak menghasilkan SQL atau event.
- PostgreSQL selalu menentukan hasil F77 dan hanya mengembalikan event Published; kegagalan AI wajib fallback ke F19/F20.
- Gambar poster, OCR, prompt, natural-language query, dan output model adalah input tidak tepercaya. Batasi ukuran/panjang, validasi MIME/schema, sanitasi tampilan, dan cegah instruksi input mengubah system policy/tool behavior.
- Terapkan rate limit, timeout, quota, retention/deletion, PII redaction, safe telemetry, dan provider failure handling.

## 9. Keamanan

- Secret wajib tersedia; aplikasi harus fail fast jika secret produksi hilang.
- Dilarang membuat fallback secret hardcoded.
- Nonaktifkan dangerous account linking kecuali kepemilikan email diverifikasi dengan desain yang disetujui.
- Hash password secara asynchronous dengan cost yang diuji pada runtime target.
- Terapkan rate limit pada login, registrasi, reset password, checkout, scanner, dan webhook.
- Terapkan rate limit terpisah pada poster scan dan natural-language search; jangan izinkan biaya provider tanpa batas.
- Terapkan CSRF protection pada cookie sesi Go dan origin UI.
- Validasi redirect URL dan cegah open redirect.
- Terapkan RBAC dan object-level authorization pada server.
- Gunakan least privilege untuk database dan provider.
- Secret hanya berada pada environment/secrets manager; jangan di-commit atau dikirim ke client.
- Jalankan dependency/security scan sebelum rilis.
- Temuan Critical/High harus nol sebelum merge/rilis.
- Jangan log gambar poster, OCR/prompt/output mentah, natural-language query, saldo/ledger detail, atau identifier provider jika mengandung PII/rahasia; simpan hanya metadata teredaksi yang diperlukan.
- Output AI selalu diperlakukan sebagai data, bukan instruksi, dan harus melewati schema/allowlist serta authorization normal.

Jika menemukan credential, fallback secret, seed password, akses lintas tenant, kebocoran riwayat/loyalty lintas pembeli-organizer, atau jalur AI yang dapat mengeksekusi aksi/SQL tanpa validasi, hentikan fitur terkait dan laporkan sebagai blocker keamanan.

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
- Integration test dengan PostgreSQL untuk transaksi, ownership, webhook, loyalty, rekomendasi, hold kursi, dan check-in.
- E2E test untuk alur organizer → admin → pembeli → payment sandbox → ticket → check-in.
- Jangan mock database pada test konkurensi/invariant.
- Adapter pihak ketiga harus memiliki contract test dan deterministic fake.

### 12.2 Target Coverage

- Global: ≥ 80% lines/functions dan ≥ 75% branches.
- Module kritis inventory, order, payment, loyalty, ticket, check-in, dan authorization: ≥ 90% branches.
- Coverage tidak menggantikan skenario acceptance dan concurrent test.

### 12.3 Skenario Wajib

- Sisa satu tiket dengan checkout bersamaan.
- Dua pembeli memilih kursi yang sama secara bersamaan; hanya satu hold atau tiket Paid yang berhasil.
- Checkout retry/idempotency.
- Webhook sukses, gagal, expired, signature salah, duplikat, dan terlambat.
- Satu payment tidak menerbitkan tiket ganda.
- Dua scan tiket yang sama secara bersamaan.
- Wrong event, Used, Cancelled, token tidak dikenal, dan pengguna tanpa izin.
- Pembatalan event dengan order Paid dan Ticket Unused/Used.
- Dua checkout bersamaan yang mencoba mereservasi poin yang sama; saldo tidak negatif dan hanya reservasi valid yang berhasil.
- Release poin pada Failed/Expired/Cancelled serta race expiry dengan webhook Paid.
- Webhook Paid replay tidak menggandakan debit/earned points; refund Completed replay tidak menggandakan reversal/restore.
- Full refund mengembalikan redeemed points dan membalik earned points; partial completed refund hanya membalik earned sesuai nominal refund.
- Rekomendasi dengan/tanpa riwayat Paid, isolasi histori pembeli, serta pengecualian non-Published/past event.
- Poster berbahaya/invalid, prompt injection, output malformed, human apply/save, dan pembuktian tidak ada auto-submit/publish.
- AI search schema invalid, percobaan SQL/prompt injection, timeout/rate limit/provider failure, fallback standar, dan hanya Published results.
- Contract test provider AI/email dengan deterministic fake.
- Restore backup dan smoke test pasca-deploy.

Test harus deterministic, terisolasi, dapat diulang, dan membersihkan data sendiri.

## 13. Aksesibilitas dan Responsif

- Target WCAG 2.1 AA untuk alur utama.
- Semua form memiliki label, instruksi, error terkait field, dan focus management.
- Semua aksi utama dapat digunakan dengan keyboard.
- Jangan mengandalkan warna saja; hasil scanner membutuhkan teks/ikon yang jelas.
- Gunakan semantic HTML sebelum ARIA.
- Hormati reduced motion.
- Uji katalog, checkout termasuk selector kursi, ticket wallet, denah statis, dan scanner pada viewport mobile.
- Denah venue adalah gambar statis dengan alt text/legenda; pemilihan kursi wajib keyboard-accessible melalui list/grid terpisah.
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
2. **Event dan katalog:** F9–F21, F65 authoring denah/section/seat.
3. **Order dan inventori:** F23–F28, F59, F65 hold/checkout kursi.
4. **Payment sandbox:** F29–F32.
5. **Ticket dan check-in:** F34–F40.
6. **Nilai tambah wajib:** integrasikan F74 dengan katalog, F75 dengan order/payment/refund, serta F76/F77 setelah AI decision gate.
7. **Operasional/kualitas wajib:** F43–F46, F49–F62, termasuk email/reminder F50/F51.
8. **Should Have:** F6, F14, F22, F33, F41.
9. **Could Have:** F13, F17, F47, F48.

Fitur Won’t Have F42, F63–F64, dan F66–F73 tidak boleh diimplementasikan pada MVP tanpa perubahan scope eksplisit. F65 adalah Must Have.

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
- Concurrent overselling/same-seat/double-scan test lulus.
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
5. Untuk loyalty, invariant ledger/reservasi/refund dan concurrency test lulus.
6. Untuk AI, schema validation, human control/fallback, rate limit, redaksi/retensi, dan provider contract test lulus.
7. Aksesibilitas dan mobile behavior diverifikasi jika memiliki UI.
8. Dokumentasi dan migrasi diperbarui jika diperlukan.
9. Tidak ada placeholder, TODO, hardcoded secret, atau known critical defect.
10. Perubahan dapat di-deploy dan di-rollback dengan aman.
## 18. Larangan Eksplisit
- Jangan memakai uang, credential, atau endpoint payment produksi pada MVP.
- Jangan membuat tabel saat runtime atau menyimpan data aplikasi ke file JSON.
- Jangan memakai ID berbasis timestamp untuk entitas bisnis.
- Jangan hardcode secret, password demo, role admin, harga, atau status.
- Jangan percaya harga, role, ownership, atau status dari client.
- Jangan menerbitkan tiket sebelum webhook sukses terverifikasi.
- Jangan memperbarui inventory/check-in tanpa transaksi atomik.
- Jangan menyimpan token QR mentah di log/analytics.
- Jangan mengubah atau menghapus entry ledger loyalitas; gunakan entry kompensasi.
- Jangan menggunakan floating point untuk Rupiah, poin, earn, redeem, reversal, atau restore.
- Jangan memberi AI akses langsung ke database/tool mutasi, menerima output tanpa schema validation, atau membiarkan F76 auto-submit/publish.
- Jangan menggunakan hasil AI sebagai SQL; F77 hanya memproduksi filter allowlist dan harus memiliki fallback standar.
- Jangan memasang SDK AI/provider sebelum decision gate disetujui.
- Jangan menggunakan prerelease dependency pada jalur kritis.
- Jangan mengimplementasikan fitur Won’t Have tanpa persetujuan perubahan scope.
