# Arsitektur Sistem MyTicketIn

| Atribut | Nilai |
|---|---|
| **Sistem** | MyTicketIn |
| **Versi dokumen** | 1.1 |
| **Status** | Arsitektur target MVP akademik |
| **Gaya arsitektur** | Modular monolith; transisi Go API → Next.js Route Handlers (RFC-021) |
| **Platform** | Aplikasi web responsif |
| **Pasar awal** | Indonesia, event tatap muka |
| **Model pembayaran MVP** | Payment gateway sandbox, tanpa uang nyata |
| **Target deployment** | Vercel (Next.js) setelah paritas RFC-021; Go terpisah selama transisi |
| **Rencana implementasi** | RFC-001 sampai RFC-014 (perilaku), RFC-021 (pindah runtime) |
| **Ekstensi komersial** | RFC-015 sampai RFC-020, status Deferred |

## 1. Pendahuluan dan Tujuan Sistem

### 1.1 Latar Belakang

MyTicketIn menyatukan proses pembuatan event, penjualan tiket, pembayaran, penerbitan e-ticket, dan check-in yang sebelumnya dapat tersebar di formulir, pesan pribadi, transfer manual, atau spreadsheet. Sistem ditujukan untuk empat kelompok pengguna:

- **Pembeli:** mencari event, melakukan checkout, dan menggunakan tiket.
- **Organizer:** membuat event, mengatur inventori, dan memantau penjualan.
- **Petugas check-in:** memvalidasi tiket di venue.
- **Admin:** memoderasi organizer/event dan menangani kasus operasional.

### 1.2 Tujuan Bisnis

1. Mengurangi rekap manual oleh organizer.
2. Memberikan status order dan tiket yang jelas kepada pembeli.
3. Mencegah overselling dan penggunaan tiket lebih dari satu kali.
4. Menyediakan jejak audit untuk tindakan sensitif.
5. Membuktikan kelayakan alur end-to-end melalui MVP akademik.

### 1.3 Tujuan Teknis

- Menjaga invariant transaksi melalui PostgreSQL dan transaksi atomik.
- Memisahkan domain dari framework serta layanan pihak ketiga.
- Memungkinkan pengujian setiap use case tanpa browser atau provider nyata.
- Menyediakan deployment yang stateless, terukur, dan dapat dipulihkan.
- Menjaga keamanan autentikasi, webhook, QR, dan data lintas organizer.

### 1.4 Ruang Lingkup Arsitektur

Dokumen ini mencakup arsitektur target untuk **66 fitur aktif MVP akademik** dari **77 ID fitur**: 57 Must Have, 5 Should Have, 4 Could Have, dan 11 Won’t Have. F20, F46, F50, F51, dan F65 telah dipromosikan menjadi Must Have; F49 tetap Must Have. Detail implementasi tetap berada pada `RFC/RFC-001.md` sampai `RFC/RFC-014.md`.

Tidak termasuk:

- Uang nyata, settlement, payout, dan refund finansial produksi.
- Editor denah interaktif, clickable map, orphan-seat optimization, transfer/resale, voucher, dan dynamic pricing.
- Aplikasi mobile native, scanner offline, serta event online/hybrid.
- Multi-negara, multi-mata uang, dan microservices.

Ekspansi aktif menambahkan rekomendasi event serupa (F74), loyalty points yang terisolasi per organizer (F75), pemindaian poster berbantuan AI menjadi draft (F76), dan pencarian natural-language berbantuan AI (F77). Seluruhnya tetap sandbox/data uji; AI tidak boleh menerbitkan event, menghasilkan SQL, atau menciptakan event.

## 2. Batasan dan Asumsi

### 2.1 Batasan Produk

- MVP menggunakan Bahasa Indonesia dan Rupiah.
- Satu order hanya memuat tiket dari satu event.
- Setiap event memilih tepat satu mode inventori: `GENERAL_ADMISSION`, `ZONED`, atau `RESERVED_SEATING`.
- Reservasi kuota dan hold kursi berlaku **15 menit**.
- Maksimal **5 tiket per jenis tiket per akun per event**.
- Satu unit order Paid menghasilkan satu tiket.
- Check-in memerlukan koneksi internet.
- Transaksi menggunakan data dan credential sandbox.

### 2.2 Batasan Proyek

- Horizon rencana adalah 12 minggu.
- Baseline kapasitas adalah satu full-stack engineer.
- Layanan diutamakan menggunakan free/academic tier.
- RFC dikerjakan ketat secara berurutan, tanpa implementasi paralel.
- Provider payment, object storage, scheduler, dan email belum seluruhnya dipilih.

### 2.3 Asumsi Infrastruktur

- Aplikasi **belum memiliki deployment aktif** dan provider hosting belum dipilih.
- Vercel bukan target deployment proyek ini.
- Provider terpilih harus mendukung binary Go, Node.js 24 untuk UI Next.js, HTTPS, environment variable/secret, webhook publik, health check, dan deployment yang dapat di-rollback.
- Bentuk hosting dapat berupa container platform, PaaS Node.js, atau VPS dengan container; keputusan ditutup pada RFC-001.
- PostgreSQL dikelola oleh **Neon** dan setiap lingkungan menggunakan database/branch terisolasi.
- Scheduler bersifat eksternal; tidak menggunakan timer dalam proses serverless.
- Kamera perangkat dapat diakses melalui browser yang didukung.

### 2.4 Batas Kepatuhan

MVP akademik tidak membuktikan kesiapan komersial. Pilot dengan pengguna atau uang nyata memerlukan keputusan tambahan untuk UU PDP, KYC organizer, merchant of record, pajak, settlement, payout, refund, retensi data, SLA, dan incident response. Area tersebut telah dirancang awal dalam RFC-015–020, tetapi seluruhnya berstatus **Deferred** dan tidak mengizinkan aktivasi uang/data nyata.

## 3. Kondisi Saat Ini dan Arsitektur Target

### 3.1 Kondisi Prototype

Kode saat ini adalah prototype autentikasi:

- Next.js 14, React 18, TypeScript 5, dan Tailwind CSS 3 pada UI prototype.
- Login username/kata sandi serta Google melalui NextAuth prototype.
- Raw SQL melalui `@neondatabase/serverless`.
- Prisma schema prototype hanya memuat `User` dan **bukan** persistence target.
- Runtime transaksi target adalah Go; belum ada `backend/cmd/api` produksi.
- Konfigurasi URL autentikasi masih membaca environment khusus Vercel dan harus dibuat provider-neutral pada RFC-001.
- Terdapat runtime DDL, fallback JSON, seed account di request path, ID berbasis waktu, serta fallback secret.
- Belum ada module event, order, payment, ticket, check-in, test suite, atau CI.

Kondisi tersebut bukan arsitektur akhir. RFC-001 dan RFC-002 wajib menyelesaikan migrasi serta risiko keamanan sebelum domain baru dibangun.

### 3.2 Arsitektur Target

MyTicketIn menggunakan **modular monolith berbasis domain**:

- Domain, API, webhook, dan job berjalan dalam **satu binary Go**.
- Next.js adalah presentation layer; tidak menjadi source of truth transaksi.
- Data disimpan pada satu PostgreSQL.
- Komunikasi UI ke domain melalui HTTP JSON ke API Go.
- Integrasi eksternal dibungkus dengan port/adapter di Go.
- Transaksi lintas entitas penting tetap atomik di PostgreSQL.

### 3.3 Alasan Memilih Modular Monolith

| Pertimbangan | Alasan |
|---|---|
| **Ukuran tim** | Satu engineer lebih mudah mengembangkan dan mengoperasikan satu aplikasi |
| **Timeline** | Tidak membutuhkan service discovery, distributed tracing, atau deployment banyak layanan |
| **Konsistensi data** | Inventori, payment, ticket, dan check-in membutuhkan transaksi kuat |
| **Pengujian** | Use case dapat diuji melalui service tanpa jaringan antar-service |
| **Biaya** | Cocok dengan free/academic tier |
| **Evolusi** | Boundary domain tetap memungkinkan ekstraksi service jika skala masa depan membutuhkannya |

Microservices tidak direkomendasikan pada MVP karena menambah distributed transaction, latency, operasional, dan failure mode tanpa manfaat yang sebanding.

## 4. Prinsip Arsitektur

1. **PostgreSQL adalah source of truth.**
2. **Invariant dijaga database dan transaction**, bukan hanya UI.
3. **Server Components menjadi default**; Client Components hanya untuk interaksi browser.
4. **Route Handler dan UI harus tipis**; aturan bisnis berada di application/domain service.
5. **Dependency mengarah ke dalam:** presentation → application → domain.
6. **SDK provider hanya berada di adapter.**
7. **Payment dan check-in tidak menggunakan optimistic update.**
8. **Semua aksi sensitif memiliki authorization dan audit.**
9. **Tidak ada fallback diam-diam** untuk database, secret, auth, atau payment.
10. **Observability tidak boleh membocorkan PII, secret, atau token QR.**
11. **Major upgrade dipisahkan dari perubahan fitur.**
12. **Fitur Won’t Have tidak diimplementasikan tanpa perubahan scope.**
13. **AI hanya memberi usulan terstruktur** yang melewati validasi deterministik dan, untuk authoring, konfirmasi manusia.
14. **Loyalty adalah nilai promosi sandbox tanpa nilai tunai** dan tidak boleh mengubah ledger finansial komersial Deferred.

## 5. Diagram Konteks Sistem

```mermaid
flowchart LR
  Buyer[Buyer]
  Organizer[Organizer]
  Staff[CheckInStaff]
  Admin[Admin]
  MyTicketIn["MyTicketIn Web Application"]
  Google[GoogleOAuth]
  Payment["Payment Gateway Sandbox"]
  Storage[ObjectStorage]
  Email[EmailProvider]
  AI["AI Provider Candidate"]
  Scheduler[ExternalScheduler]
  Database[(NeonPostgreSQL)]

  Buyer -->|browse_checkout_wallet| MyTicketIn
  Organizer -->|manage_event_dashboard| MyTicketIn
  Staff -->|scan_ticket| MyTicketIn
  Admin -->|moderate_operate| MyTicketIn
  MyTicketIn -->|oauth| Google
  MyTicketIn -->|create_payment| Payment
  Payment -->|signed_webhook| MyTicketIn
  MyTicketIn -->|store_event_media| Storage
  MyTicketIn -->|transactional_email_and_reminder| Email
  MyTicketIn -.->|validated_ai_request| AI
  Scheduler -->|protected_job_call| MyTicketIn
  MyTicketIn -->|transactional_data| Database
```

Trust boundary:

- Browser, Google, payment gateway, scheduler, storage, email, dan AI provider dianggap eksternal.
- Semua input eksternal harus diotentikasi atau divalidasi.
- Database hanya diakses oleh server melalui repository.
- Output AI dianggap tidak tepercaya: hanya schema terstruktur yang diizinkan, kemudian dinormalisasi dan divalidasi terhadap aturan katalog/event sebelum digunakan.

## 6. Komponen Utama Sistem

| Komponen | Fungsi |
|---|---|
| **Public Web** | Katalog, pencarian/filter, pencarian natural-language tervalidasi, rekomendasi, dan detail event |
| **Buyer Experience** | Checkout, loyalty per organizer, status payment, order history, dan ticket wallet |
| **Organizer Workspace** | Pengajuan organizer, event authoring, pemindaian poster ke draft, ticket type, dan dashboard |
| **Admin Console** | Moderasi, rekonsiliasi, refund sandbox, pencarian, dan audit |
| **Check-in UI** | Kamera scanner, validasi QR, input manual, dan hasil scan |
| **Application Services** | Orkestrasi use case dan transaction boundary |
| **Domain Modules** | Invariant, status transition, dan aturan bisnis |
| **Repositories** | Persistence melalui sqlc/pgx dan PostgreSQL |
| **Provider Adapters** | Payment, storage, email, analytics, scheduler, dan AI |
| **Platform Services** | Env validation, logger, error mapping, security, health, dan format lokal |

## 7. Arsitektur Komponen Internal

### 7.1 Dependency Layers

```mermaid
flowchart TB
  Presentation["Presentation: Pages, RSC, Client UI, Route Handlers"]
  Application["Application: Use Cases and Transaction Orchestration"]
  Domain["Domain: Entities, Policies, Invariants, State Transitions"]
  Ports["Ports: Repository and Provider Interfaces"]
  Persistence["Infrastructure: sqlc/pgx Repositories"]
  Providers["Infrastructure: External Provider Adapters"]
  Database[(PostgreSQL)]
  External["External APIs"]

  Presentation --> Application
  Application --> Domain
  Application --> Ports
  Persistence --> Ports
  Providers --> Ports
  Persistence --> Database
  Providers --> External
```

`Domain` tidak mengimpor React, Next.js, chi, pgx, atau SDK provider. Infrastructure mengimplementasikan interface yang didefinisikan oleh module/application.

### 7.2 Module Map

| Module | Tanggung Jawab | RFC |
|---|---|---|
| `platform` | Env, DB client, errors, logger, health, locale | RFC-001, RFC-014 |
| `auth` | Registrasi pembeli, login tiga portal, OAuth, session, RBAC `USER\|ADMIN` | RFC-002, RFC-013 |
| `audit` | Append-only audit dan event analytics | RFC-003 |
| `organizers` | Profil organizer dan moderasi | RFC-004 |
| `events` | Authoring, ticket type, lifecycle, staff, dan penerapan saran draft tervalidasi | RFC-005–006 |
| `catalog` | Discovery, filter, natural-language-to-filter orchestration, dan projection event Published | RFC-007 |
| `ai` | `AiInferencePort`, adapter provider-neutral, schema output, rate/budget/fallback untuk F76/F77 | RFC-005, RFC-007 |
| `inventory` | Availability, counter, reservation release | RFC-008 |
| `orders` | Checkout, item snapshot, idempotency, expiry | RFC-008 |
| `payments` | Adapter sandbox, webhook inbox, reconciliation | RFC-009 |
| `refunds` | Lifecycle refund sandbox | RFC-009 |
| `loyalty` | Akun poin buyer–organizer, reservasi/redeem, ledger append-only, reversal/restoration | RFC-008–009 |
| `tickets` | Issuance, QR token, buyer wallet | RFC-010 |
| `check-in` | Scanner API, atomic use, attempt log | RFC-011 |
| `reporting` | Organizer/admin dashboard dan export | RFC-012 |
| `recommendations` | Kandidat, scoring, dan projection rekomendasi event serupa | RFC-012 |
| `notifications` | In-app, email transaksional, dan reminder wajib | RFC-013 |

### 7.3 Struktur Folder Target

```text
app/
  (public)/
  (buyer)/
  organizer/
  admin/
  api/
    webhooks/
    internal/jobs/
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
  loyalty/
  ai/
  tickets/
  check-in/
  reporting/
  recommendations/
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

Setiap module dapat memiliki:

```text
domain/          # entity, value object, policy, state transition
application/     # command/query service dan port
infrastructure/  # sqlc/pgx repository dan provider adapter
ui/              # komponen yang hanya dimiliki module
```

Folder hanya dibuat jika berisi implementasi nyata; hindari abstraksi kosong.

## 8. Tech Stack

Versi target mengikuti `RULES.md` dan diverifikasi pada 19 September 2026.

| Area | Teknologi | Versi Target | Alasan |
|---|---|---:|---|
| Runtime transaksi | Go | 1.27.1 | Concurrent-safe, binary stateless, sesuai invariant ACID |
| HTTP API | chi | v5 | Router ringan tanpa framework berat |
| Driver DB | pgx | v5 | PostgreSQL native, transaksi eksplisit |
| Migrasi | goose SQL `/migrations` + `npm run migrate` | Node; tabel `goose_db_version` |
| Query typed | sqlc | CLI | SQL eksplisit, struct ter-generate |
| Logging | slog | stdlib | JSON terstruktur |
| Presentation | Next.js App Router | 16.3.4 | UI/RSC/scanner browser |
| UI | React / React DOM | 19.2.8 | Komponen dan aksesibilitas |
| Bahasa UI | TypeScript | 7.0.2 | Type safety UI |
| Styling | Tailwind CSS | 4.3.3 | Sistem desain responsif |
| Database | PostgreSQL pada Neon | Terkelola | ACID, constraint, branch |
| Auth | Sesi Go (RFC-002) | — | Revoke-all dan ownership server-side |
| Scanner QR | `@zxing/browser` | 0.2.1 | Camera decoding |
| E2E | Playwright | 1.63.0 | Browser dan mobile viewport |
| Hosting | Provider non-Vercel — TBD pada RFC-001 | TBD | Wajib menjalankan binary Go dan UI Node.js |

Prisma dan NextAuth bukan target. Upgrade prototype dilakukan sebagai compatibility migration pada RFC-001/002, bukan bersamaan dengan fitur domain.

## 9. Model Domain dan Data

### 9.1 Hubungan Entitas

```mermaid
erDiagram
  User ||--o| OrganizerProfile : applies
  User ||--o{ AuthAccount : links
  User ||--o{ Order : places
  OrganizerProfile ||--o{ Event : owns
  OrganizerProfile ||--o{ LoyaltyAccount : sponsors
  User ||--o{ LoyaltyAccount : owns
  LoyaltyAccount ||--o{ LoyaltyEntry : records
  Order ||--o{ LoyaltyReservation : reserves
  LoyaltyAccount ||--o{ LoyaltyReservation : holds
  Order ||--o{ LoyaltyEntry : references
  Refund ||--o{ LoyaltyEntry : compensates
  Event ||--o{ EventTicketType : offers
  Event ||--o{ VenueSection : sections
  Event ||--o| SeatMapAsset : chart
  VenueSection ||--o{ EventSeat : contains
  Event ||--o{ EventStaffAssignment : assigns
  EventTicketType ||--o{ InventoryReservation : reserves
  EventSeat ||--o{ InventoryReservation : holds
  Order ||--|{ OrderItem : contains
  Order ||--o{ InventoryReservation : holds
  Order ||--o| Payment : pays
  Payment ||--o{ PaymentWebhookEvent : receives
  Payment ||--o{ Refund : refunds
  OrderItem ||--o{ Ticket : issues
  EventSeat ||--o| Ticket : assigns
  Ticket ||--o{ CheckInAttempt : attempts
  User ||--o{ AuditLog : acts
  User ||--o{ Notification : receives
```

### 9.2 Entitas Utama

| Entitas | Tanggung Jawab Data |
|---|---|
| `User` | Identitas global dan status akun |
| `AuthAccount` | Hubungan provider OAuth yang aman |
| `OrganizerProfile` | Capability organizer dan status moderasi |
| `Event` | Detail, owner, venue, waktu, lifecycle, dan inventory mode |
| `EventTicketType` | Harga, kuota, jadwal jual, counter, serta kategori/area |
| `VenueSection` | Pengelompokan area/kategori pada event zoned atau reserved |
| `SeatMapAsset` | Gambar denah statis, alt text, dan legenda |
| `EventSeat` | Identitas kursi bernomor, section, dan status hold/Paid |
| `Order` | Buyer, status, expiry, total, dan nomor order |
| `OrderItem` | Snapshot tiket, harga, kategori, dan label kursi |
| `InventoryReservation` | Kuota atau hold kursi aktif per order sampai expiry/release |
| `Payment` | Provider reference, metode, nominal, dan status |
| `PaymentWebhookEvent` | Inbox idempoten untuk event provider |
| `Refund` | Lifecycle refund sandbox |
| `LoyaltyAccount` | Saldo terproyeksi yang terisolasi untuk satu pasangan buyer–organizer |
| `LoyaltyEntry` | Ledger poin append-only untuk earn, redeem debit, earn reversal, dan redeem restoration; pelepasan hanya mengubah status reservation |
| `LoyaltyReservation` | Penahanan poin untuk Order Pending sampai payment/expiry |
| `Ticket` | Unit fulfillment, token QR hash, status, dan snapshot kursi |
| `CheckInAttempt` | Hasil setiap percobaan validasi |
| `AuditLog` | Jejak perubahan sensitif yang append-only |
| `Notification` | Pesan in-app/email dan delivery status |

### 9.3 Status Canonical

| Entitas | Status |
|---|---|
| Organizer | Pending, Approved, Rejected, Suspended |
| Event | Draft, PendingReview, Published, Rejected, Cancelled, Completed |
| Order | Pending, Paid, Failed, Expired, Cancelled, Refunded |
| Payment | Created, Pending, Succeeded, Failed, Expired, Refunded |
| Ticket | Unused, Used, Cancelled |
| Refund | Requested, Approved, Rejected, Processing, Completed, Failed |

Reservasi bukan status Ticket. Ticket baru dibuat setelah Order Paid.

### 9.4 Invariant Data

1. `paidQuantity + reservedQuantity <= quota`.
2. Nilai counter tidak boleh negatif.
3. Satu external payment reference hanya terkait satu Payment.
4. Satu provider webhook event diproses efektif satu kali.
5. Satu unit OrderItem Paid menghasilkan tepat satu Ticket.
6. Satu Ticket memiliki paling banyak satu check-in berhasil.
7. Event Cancelled tidak kembali Published.
8. Organizer hanya membaca data event miliknya.
9. Satu `LoyaltyAccount` unik untuk pasangan buyer–organizer; saldo dan entry tidak boleh dipindah atau dipakai lintas organizer.
10. Earn adalah `floor(netPaidRupiah / 1.000)` poin; redemption bernilai Rp10 per poin dan tidak melebihi 20% nilai order sebelum redemption.
11. Saldo tersedia tidak negatif dan poin Pending Order ditahan melalui `LoyaltyReservation`; commit/release harus idempoten.
12. `LoyaltyEntry` append-only. Refund membalik poin hasil pembelian secara proporsional/deterministik, dan full refund mengembalikan seluruh poin yang diredeem pada order tersebut tepat satu kali.
13. Poin tidak kedaluwarsa, tidak bernilai tunai, tidak dapat dicairkan, dan hanya berlaku pada transaksi sandbox.
14. F74 hanya merekomendasikan event Published dengan waktu mulai di masa depan.
15. F76 tidak pernah auto-publish; F77 tidak menghasilkan SQL atau event dan hanya menghasilkan intent/filter dalam allowlist.
16. Setiap event memiliki tepat satu `inventoryMode`; mode immutable setelah commerce.
17. Satu `EventSeat` paling banyak memiliki satu hold aktif atau satu Ticket Paid.
18. Hold kursi berlangsung 15 menit dan dilepas tepat satu kali pada Failed/Expired/Cancelled.

Invariant dilindungi melalui transaction, foreign key, unique/check constraint, dan conditional update.

### 9.5 Konvensi Penyimpanan

- ID menggunakan CUID/UUID non-predictable.
- Uang disimpan sebagai integer Rupiah.
- Waktu disimpan sebagai `TIMESTAMPTZ`/UTC.
- sqlc memetakan kolom snake_case ke struct Go.
- OrderItem menyimpan snapshot agar perubahan harga tidak mengubah transaksi lama, termasuk kategori/area dan label kursi.
- Order menyimpan snapshot redemption Rupiah/poin dan nilai net paid sebagai dasar earn/reversal.
- Transaksi, ticket, audit, dan check-in tidak di-hard-delete.
- Ledger loyalty tidak diubah/dihapus; koreksi selalu berupa compensating entry dengan idempotency reference.
- Skema hanya berubah melalui migration; runtime DDL dilarang.

## 10. Alur Data Utama

### 10.1 Publikasi Event

```mermaid
sequenceDiagram
  actor User
  participant Web as MyTicketInWeb
  participant Org as OrganizerModule
  participant Event as EventModule
  participant Admin as AdminConsole
  participant DB as PostgreSQL

  User->>Web: Submit organizer profile
  Web->>Org: applyOrganizer
  Org->>DB: Insert profile Pending
  Admin->>Org: Approve with reason
  Org->>DB: Update Approved plus audit
  User->>Event: Create draft, ticket types, sections/seats, and static map
  Event->>DB: Save owned draft
  User->>Event: Submit for review
  Admin->>Event: Approve event
  Event->>DB: Transition to Published plus audit
```

### 10.2 Checkout sampai Penerbitan Tiket

```mermaid
sequenceDiagram
  actor Buyer
  participant App as NextJsApplication
  participant Order as OrderService
  participant DB as PostgreSQL
  participant Gateway as PaymentSandbox
  participant Ticket as TicketService

  Buyer->>App: Select tickets or seats and confirm checkout
  App->>Order: createOrder with idempotency key
  Order->>DB: Begin transaction
  Order->>DB: Lock ticket types and seats in ID order
  Order->>DB: Validate quota/seats and create reservation or seat hold
  DB-->>Buyer: Order Pending and expiresAt
  Buyer->>App: Select payment method
  App->>Gateway: createPayment
  Gateway-->>Buyer: Sandbox payment instructions
  Gateway->>App: Signed webhook
  App->>App: Verify signature and deduplicate event
  App->>DB: Lock order and convert reserved to paid
  App->>Ticket: Issue exactly one ticket per unit
  Ticket->>DB: Store ticket and QR token hash
  App-->>Buyer: Wallet displays Unused tickets
```

Transaction payment harus mengikuti lock order:

1. Lock Order.
2. Lock seluruh EventTicketType berdasarkan ID ascending; pada `RESERVED_SEATING` kunci juga `EventSeat` terurut.
3. Validasi Order masih Pending, belum melewati cutoff, dan payload sesuai mode event.
4. Kurangi `reservedQuantity`, tambah `paidQuantity`, atau konversi hold kursi menjadi assignment Paid.
5. Ubah Order/Payment.
6. Terbitkan Ticket.
7. Tulis audit/outbox dalam transaction yang sama.

### 10.3 Expiry dan Webhook Terlambat

```mermaid
flowchart TD
  Scheduler[Scheduler] --> ExpiryJob[ExpireOrdersJob]
  ExpiryJob --> LockOrder[LockDuePendingOrder]
  LockOrder --> TimeCheck{PastExpiresAt}
  TimeCheck -->|no| Skip[Skip]
  TimeCheck -->|yes| Release[ReleaseReservation]
  Release --> MarkExpired[MarkOrderExpired]
  LateWebhook[LateSuccessWebhook] --> Reconcile[AdminReconciliationQueue]
  Reconcile --> NoTicket["Do not auto-issue ticket"]
```

Job menggunakan waktu database, batch, dan `SKIP LOCKED`. Job harus aman dijalankan ulang. Webhook sukses setelah expiry tidak menghidupkan reservasi lama karena kuota mungkin sudah terjual.

### 10.4 Check-in

```mermaid
sequenceDiagram
  actor Staff
  participant Scanner as ScannerUI
  participant API as CheckInAPI
  participant Auth as AuthorizationService
  participant DB as PostgreSQL

  Staff->>Scanner: Scan QR
  Scanner->>API: Token plus event ID plus idempotency key
  API->>Auth: Verify owner or staff assignment
  Auth-->>API: Authorized
  API->>DB: Lookup token hash and conditional Unused to Used
  alt first valid scan
    DB-->>API: Valid and usedAt
    API->>DB: Insert VALID attempt
  else already used or invalid
    DB-->>API: Reason code
    API->>DB: Insert rejected attempt
  end
  API-->>Scanner: Safe localized result
```

Kehilangan koneksi tidak mengubah Ticket secara lokal. Dua scan bersamaan hanya boleh menghasilkan satu transisi berhasil.

### 10.5 Loyalty pada Checkout, Payment, dan Refund

```mermaid
sequenceDiagram
  actor Buyer
  participant Order as OrderService
  participant Loyalty as LoyaltyService
  participant DB as PostgreSQL
  participant Payment as PaymentService

  Buyer->>Order: Checkout event milik satu organizer
  Order->>Loyalty: Validate requested points
  Loyalty->>DB: Lock buyer-organizer account
  Loyalty->>DB: Reserve points (Rp10/point, max 20%)
  Payment->>DB: First trusted transition to Paid
  Payment->>Loyalty: Commit redemption and earn floor(net paid/1000)
  Note over Loyalty,DB: Append-only, idempotent, same transaction boundary
```

Order Failed/Expired/Cancelled melepaskan reservasi poin tepat satu kali. Refund membuat compensating entries: membalik poin hasil pembelian sesuai nominal refund dengan aturan pembulatan yang ditetapkan RFC-009; full refund juga memulihkan seluruh poin yang diredeem pada order. Poin tidak memiliki cash-out atau expiry.

### 10.6 AI Poster ke Draft dan Natural-Language Search

```mermaid
flowchart LR
  Poster[PosterUpload] --> ValidateFile[ValidateTypeSizeAndAccess]
  ValidateFile --> AIPort[AiInferencePort]
  AIPort --> DraftSchema[StructuredDraftSchema]
  DraftSchema --> DomainRules[DeterministicEventValidation]
  DomainRules --> Review[OrganizerReviewAndEdit]
  Review --> SaveDraft[SaveDraftOnly]

  Query[NaturalLanguageQuery] --> SearchPort[AiInferencePort]
  SearchPort --> IntentSchema[AllowlistedSearchIntent]
  IntentSchema --> ValidateFilters[NormalizeAndValidate]
  ValidateFilters --> CatalogQuery[ParameterizedCatalogRepository]
```

F76 tidak membuat atau memublikasikan event tanpa review manusia; output hanya mengisi usulan field Draft. F77 tidak menerima SQL/provider query, event ID ciptaan model, atau status selain Published. Application service menyusun query repository parametrik dari filter tervalidasi. Jika AI tidak tersedia, F76 kembali ke authoring manual dan F77 ke pencarian/filter deterministik F19/F20.

### 10.7 Rekomendasi Event Serupa

F74 mengambil kandidat hanya dari event Published yang dimulai di masa depan. Untuk buyer terautentikasi, ranking menggunakan sinyal dari riwayat Paid milik buyer sendiri: kategori, lokasi, dan organizer; tidak memakai histori buyer lain atau order non-Paid. Jika sinyal tidak cukup, contextual fallback hanya memakai kategori, lokasi, dan organizer dari event/katalog aktif; bila tidak ada skor positif, hasil dikembalikan kosong tanpa memasukkan event acak. Hasil selalu divalidasi ulang secara deterministik, dapat dijelaskan dengan reason code non-sensitif, dan tidak boleh menjadi keputusan eligibility atau harga.

## 11. Kontrak API dan Boundary

### 11.1 Pola API

- Route Handler memvalidasi input dengan Zod.
- Session, role, capability, dan ownership diperiksa sebelum service dipanggil.
- Application service mengembalikan typed result/error.
- Error mapper menghasilkan envelope konsisten.
- List menggunakan cursor/page pagination.
- Mutasi kritis menerima idempotency key bila diperlukan.

Contoh error:

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

API bersifat mode-aware. `SEAT_UNAVAILABLE` dipakai ketika kursi sudah di-hold atau Paid. `INVENTORY_MODE_MISMATCH` dipakai ketika payload tidak sesuai mode event.

### 11.2 Kelompok Endpoint

| Area | Endpoint Representatif | Akses |
|---|---|---|
| Auth | `/api/register`, `/api/auth/*` | Publik/session |
| Organizer | `/api/organizers/application`, `/api/admin/organizers/*` | User/Admin |
| Event | `/api/organizer/events/*`, `/api/admin/events/*` | Organizer/Admin |
| Inventory | `/api/organizer/events/:id/seats`, `/api/events/:slug/seats` | Organizer/Publik read model |
| Catalog | `/api/events`, `/api/events/:slug` | Publik |
| Discovery | `/api/events/ai-filter`, `/api/events/:slug/recommendations` | Publik/session opsional |
| Order | `/api/orders`, `/api/orders/:id` | Pembeli pemilik |
| Loyalty | `/api/loyalty/accounts/:organizerProfileId`, `/api/loyalty/accounts/:organizerProfileId/ledger` | Pembeli pemilik |
| Payment | `/api/orders/:id/payment`, `/api/webhooks/payments/:provider` | Pembeli/Provider |
| Ticket | `/api/tickets/:id`, `/api/tickets/:id/qr` | Pemilik |
| Check-in | `/api/events/:id/check-ins` | Owner/Petugas |
| Dashboard | `/api/organizer/dashboard`, `/api/organizer/events/:eventId/*`, `/api/admin/operations/*` | Organizer/Admin |
| Jobs | `/api/internal/jobs/expire-orders` | Signed scheduler |
| Health | `/api/health/live`, `/api/health/ready` | Infrastruktur |

Kontrak rinci, field, kode error, dan response terdapat pada RFC pemilik endpoint.

## 12. Manajemen State dan Caching

### 12.1 State

| State | Source of Truth |
|---|---|
| Search/filter/pagination/tab | URL query parameter |
| Form sementara | React local state |
| Session/identity | NextAuth server session |
| Event/order/payment/ticket | PostgreSQL |
| Loyalty account/reservation/ledger | PostgreSQL transaction/append-only ledger |
| Inventory availability | PostgreSQL transaction/counter |
| Scanner camera state | Client Component lokal |
| Provider delivery state | Provider adapter plus persisted inbox/outbox |

Global client state library tidak diperlukan untuk MVP. Tambahkan hanya jika kebutuhan lintas halaman tidak dapat ditangani oleh server state dan URL.

### 12.2 Caching

- Katalog dan detail Published dapat memakai bounded revalidation.
- Perubahan event harus menginvalidasi cache terkait.
- Inventory, order, payment, refund, loyalty, QR validation, dan check-in tidak boleh memakai cache sebagai source of truth.
- Rekomendasi dan hasil natural-language hanya boleh meng-cache kandidat Published/future secara terbatas; authorization serta validasi filter tetap dilakukan per request.
- Response QR dan halaman ticket tidak boleh public-cache.
- Dashboard memakai query terindeks dan pagination; materialized aggregate belum diperlukan pada MVP.

## 13. Integrasi Pihak Ketiga

| Integrasi | Port/Adapter | Status | Fallback |
|---|---|---|---|
| Neon/PostgreSQL | sqlc/pgx repository | Dipilih | Tidak ada fallback file |
| Google OAuth | NextAuth Provider | Digunakan prototype | Credentials login |
| Payment | `PaymentGateway` | TBD sebelum RFC-009 | Deterministic fake untuk test |
| Object storage | `ObjectStorage` | TBD sebelum RFC-005 | Placeholder gambar |
| Scheduler | `JobScheduler`/signed endpoint | TBD sebelum RFC-008 | Manual trigger hanya untuk test |
| Email | `EmailProvider` | Wajib dipilih sebelum RFC-013 selesai | In-app notification tetap fallback saat delivery provider gagal |
| AI | `AiInferencePort` | Provider-neutral; gate RFC-005 sebelum F76/F77 | Authoring dan search/filter deterministik |
| QR generator | `QrRenderer` | Direncanakan | Tidak ada QR sebelum RFC-010 |
| QR scanner | Browser adapter | Direncanakan | Input kode manual sebagai Should Have |

Aturan adapter:

- SDK provider tidak boleh diimpor oleh domain.
- Provider status dipetakan ke status canonical.
- Timeout, retry, dan idempotensi didefinisikan per operasi.
- Fake deterministic tersedia untuk automated test.
- SDK tidak dipasang sebelum decision gate disetujui.
- `AiInferencePort` hanya menerima input minimum dan mengembalikan DTO schema-versioned; adapter menetapkan timeout, ukuran, retry terbatas, redaksi, dan pencatatan model/config version.

Neon AI Gateway boleh dievaluasi sebagai **kandidat**, bukan pilihan yang telah disetujui. Status beta, biaya/paid tier, ketersediaan region, retensi/pemrosesan data, model yang tersedia, latency, quota, dan exit strategy wajib diverifikasi pada decision gate; arsitektur tidak bergantung pada API spesifiknya.

## 14. Deployment dan Infrastruktur

MyTicketIn **belum di-deploy**. Diagram berikut adalah topologi target yang bersifat provider-neutral, bukan representasi lingkungan yang sudah tersedia. Pemilihan antara container platform, PaaS Node.js, atau VPS/container dilakukan melalui decision gate RFC-001.

### 14.1 Topologi Deployment

```mermaid
flowchart TB
  subgraph Clients [ClientDevices]
    MobileBrowser[MobileBrowser]
    DesktopBrowser[DesktopBrowser]
  end

  subgraph Host [NonVercelApplicationHost]
    Middleware[AuthMiddleware]
    WebRuntime["RSC and Route Handlers"]
    WebhookRuntime[WebhookHandlers]
    JobEndpoint[ProtectedJobEndpoints]
  end

  subgraph Neon [NeonPlatform]
    DevDB[(DevelopmentDB)]
    PreviewDB[(PreviewTestDB)]
    DemoDB[(ProductionDemoDB)]
  end

  Google[GoogleOAuth]
  Gateway[PaymentSandbox]
  Storage[ObjectStorage]
  Email[EmailProvider]
  AI[AIProviderCandidate]
  Cron[ExternalScheduler]
  Logs[LogAndMetricSink]

  MobileBrowser --> Middleware
  DesktopBrowser --> Middleware
  Middleware --> WebRuntime
  WebRuntime --> DevDB
  WebRuntime --> PreviewDB
  WebRuntime --> DemoDB
  WebRuntime --> Google
  WebRuntime --> Gateway
  Gateway --> WebhookRuntime
  WebhookRuntime --> PreviewDB
  WebhookRuntime --> DemoDB
  WebRuntime --> Storage
  WebRuntime --> Email
  WebRuntime -.-> AI
  Cron --> JobEndpoint
  JobEndpoint --> PreviewDB
  JobEndpoint --> DemoDB
  WebRuntime --> Logs
  WebhookRuntime --> Logs
  JobEndpoint --> Logs
```

Diagram menunjukkan deployment logis. Satu instance runtime hanya terhubung ke database sesuai environment, bukan ketiga database sekaligus.

### 14.2 Lingkungan

| Lingkungan | Tujuan | Data | Integrasi |
|---|---|---|---|
| Development | Pengembangan lokal | Seed eksplisit | Fake/sandbox |
| Preview/Test | Integration, E2E, UAT, load test | Data uji terisolasi | Sandbox publik |
| Production Demo | Demo akademik | Data uji terkontrol | Sandbox |

Environment variable tervalidasi saat startup. Secret tidak memiliki fallback. `.env.example` hanya berisi placeholder aman.

### 14.3 Persyaratan Provider Hosting

Provider yang dipilih wajib menyediakan:

- Runtime binary Go untuk API/webhook/job dan Node.js 24 untuk UI Next.js.
- Domain HTTPS dan endpoint publik untuk OAuth callback serta payment webhook.
- Secret/environment variable terenkripsi dan terpisah per lingkungan.
- Health check, structured log, serta akses terhadap metrik dasar.
- Deployment immutable atau versioned dengan rollback yang terdokumentasi.
- Kemampuan menjalankan migration sebagai release step.
- Konektivitas aman ke Neon PostgreSQL dan object storage terpilih.
- Egress HTTPS terkontrol ke AI provider kandidat dengan timeout, quota, dan secret terisolasi per lingkungan.
- Dukungan scheduler bawaan atau integrasi dengan scheduler eksternal.

Jika menggunakan VPS/container, tim juga bertanggung jawab atas reverse proxy, TLS renewal, process/container supervision, patching OS, firewall, backup konfigurasi, dan monitoring host. Jika menggunakan PaaS/container platform, kemampuan tersebut harus diverifikasi terhadap batas runtime, cold start, request timeout, dan biaya.

### 14.4 CI/CD

Pipeline minimum:

1. Install dari lockfile.
2. Format/lint.
3. Typecheck.
4. Unit dan integration test.
5. Migration status/drift check.
6. Dependency/security scan.
7. Build immutable artifact.
8. Deploy preview dan jalankan E2E/smoke test.
9. Approval untuk production demo.
10. Deploy artifact yang sama dan jalankan post-deploy smoke test.

Rollback mengembalikan artifact sebelumnya. Migrasi mengikuti expand → backfill → contract agar minimal satu versi aplikasi tetap kompatibel.

## 15. Keamanan

### 15.1 Autentikasi dan Session

- NextAuth mengelola credentials dan Google OAuth.
- Cookie session menggunakan `HttpOnly`, `Secure`, dan SameSite yang sesuai.
- Secret wajib tersedia dan aplikasi fail-fast jika hilang.
- Dangerous automatic email account linking dinonaktifkan.
- Password di-hash asynchronous dengan adaptive cost.
- Rate limit diterapkan pada login, register, reset, checkout, scanner, dan webhook.
- Session revocation menggunakan versi/auth state yang dapat divalidasi server.

### 15.2 Otorisasi

- Role global minimal adalah User dan Admin.
- Organizer adalah capability dari `OrganizerProfile Approved`, bukan role client.
- Petugas mendapat assignment per event.
- Route, service, dan query memeriksa role serta object ownership.
- Akses objek organisasi lain mengembalikan response aman tanpa membocorkan keberadaan data.

### 15.3 Payment dan Webhook

- Hanya credential sandbox.
- Signature diverifikasi dari raw request sesuai provider.
- Provider event ID unik mencegah replay.
- Redirect browser tidak dapat menetapkan Paid.
- Callback terlambat masuk rekonsiliasi, tidak menerbitkan tiket.
- Secret dan payload sensitif disensor dari log.

### 15.4 QR dan Check-in

- Token acak direkomendasikan 256-bit dan minimum 128-bit.
- QR tidak memuat PII.
- Database menyimpan token hash jika memungkinkan.
- Validasi dilakukan server setelah authorization.
- Conditional update menjamin satu penggunaan.
- Attempt log tidak menyimpan token mentah.

### 15.5 Data dan Kepatuhan

- Terapkan data minimization dan least privilege.
- Organizer hanya melihat data minimum peserta event sendiri.
- Audit log menyimpan metadata aman, bukan secret.
- Backup dan log mempunyai akses terbatas.
- Retensi, penghapusan, consent, dan kebijakan privasi wajib diputuskan sebelum data nyata.

### 15.6 AI dan Loyalty

- Poster dan natural-language prompt dianggap input tidak tepercaya; batasi MIME/ukuran, panjang input, rate, dan instruksi yang diteruskan.
- Jangan kirim payment data, loyalty ledger, credential, token, atau PII buyer ke AI provider. F74 menghitung sinyal Paid secara server-side dan hanya memakai data milik buyer yang sedang login.
- Output AI wajib melewati schema validation, enum/allowlist, length/range checks, dan aturan domain. Prompt injection tidak boleh dapat memilih status, ownership, harga final, SQL, atau endpoint.
- Catat consent/notice yang relevan untuk poster, provider/model/config version, latency, token/biaya bila tersedia, validation failures, fallback, dan correlation ID tanpa menyimpan prompt sensitif.
- Mutasi loyalty selalu memeriksa buyer ownership, organizer scope, order state, nominal server-side, idempotency reference, dan row lock.
- Endpoint AI dan loyalty memiliki rate limit serta abuse monitoring; error provider tidak boleh merusak draft, order, payment, atau ledger.

## 16. Skalabilitas dan Kinerja

### 16.1 Profil Uji MVP

- 5.000 tiket per event.
- 50 pembeli checkout bersamaan.
- 10 scanner bersamaan.
- Load test minimal 15 menit.

Target:

- Katalog/detail server response p95 ≤ 2 detik.
- Check-in p95 ≤ 1,5 detik.
- Overselling = 0.
- Check-in berhasil ganda = 0.

### 16.2 Strategi Skalabilitas

- Runtime aplikasi stateless sehingga dapat scale horizontal.
- Semua state transaksional berada di PostgreSQL.
- Gunakan pooled/serverless-compatible connection.
- Query memilih kolom eksplisit dan menggunakan pagination.
- Indeks mengikuti query aktual: event status/slug, owner, order expiry, payment external reference, ticket token hash, dan check-in.
- Expiry diproses dalam batch dengan `FOR UPDATE SKIP LOCKED`.
- Webhook inbox dan job bersifat idempoten.
- Public catalog dapat di-cache; state transaksi tidak.

### 16.3 Batas Skalabilitas

Modular monolith cukup untuk MVP. Ekstraksi service baru dipertimbangkan jika bukti produksi menunjukkan kebutuhan independensi scaling, ownership tim, atau isolasi failure. Kandidat pertama secara teoritis adalah notifications atau reporting, bukan inventory/payment yang membutuhkan konsistensi kuat.

## 17. Reliability, Error Handling, dan Observability

### 17.1 Reliability

- Backup database memenuhi baseline RPO 24 jam.
- Restore drill dilakukan sebelum rilis.
- Webhook, expiry job, dan notification delivery dapat di-retry dengan aman.
- Kegagalan provider tidak boleh menghasilkan transaksi lokal setengah selesai.
- Health endpoint dipisahkan menjadi liveness dan readiness.

### 17.2 Error Handling

Kategori canonical:

- `VALIDATION`
- `AUTHENTICATION`
- `AUTHORIZATION`
- `NOT_FOUND`
- `CONFLICT`
- `RATE_LIMIT`
- `PROVIDER`
- `NETWORK_CLIENT`
- `INTERNAL`

Pesan pengguna memakai Bahasa Indonesia. Error code memakai identifier Inggris yang stabil. Stack trace dan detail internal tidak dikirim ke client.

### 17.3 Logging dan Monitoring

Structured log minimal memuat timestamp, level, correlation ID, module, operation, outcome, dan duration.

Monitor:

- Error rate aplikasi.
- Webhook invalid, duplikat, atau terlambat.
- Expiry job gagal/tertunda.
- Konflik reservasi.
- Latensi p95 check-in.
- Rejected check-in menurut reason code.
- Kesehatan aplikasi/database.
- AI latency/error/timeout, schema rejection, fallback rate, dan konsumsi/quota/biaya per operasi.
- Acceptance/edit rate draft poster dan zero auto-publish violations.
- Natural-language intent rejection/fallback serta hasil yang lolos Published/future guard.
- Konflik reservasi loyalty, saldo negatif yang ditolak, duplicate ledger reference, earn/redeem/reversal/restoration mismatch.

Jangan log password, cookie, OAuth token, database URL, raw QR token, atau PII yang tidak diperlukan.

## 18. Aksesibilitas, Responsif, dan Lokalisasi

- Target WCAG 2.1 AA pada alur utama.
- Gunakan semantic HTML, keyboard navigation, focus state, label, dan error terkait field.
- Hasil scanner tidak dibedakan dengan warna saja.
- Denah venue adalah gambar statis dengan alt text/legenda; pemilihan kursi memakai list/grid keyboard-accessible yang terpisah, bukan peta klik.
- Hormati reduced motion.
- Optimalkan buyer wallet dan scanner untuk mobile.
- Dukung dua versi terbaru Chrome, Edge, Firefox, dan Safari.
- Scanner wajib diuji pada Chrome Android.
- Harga menggunakan integer Rupiah dan formatter `id-ID`.
- Waktu ditampilkan sesuai zona waktu event.

## 19. Keputusan Arsitektur Utama

| ID | Keputusan | Status | Konsekuensi |
|---|---|---|---|
| ADR-001 | Modular monolith | Diterima | Operasi sederhana; boundary module wajib dijaga |
| ADR-002 | PostgreSQL/Neon sebagai satu source of truth | Diterima | Tidak ada JSON fallback |
| ADR-003 | goose + sqlc/pgx sebagai persistence | Diterima | Runtime DDL dihentikan; Prisma bukan SoT |
| ADR-004 | Next.js sebagai presentation; Go sebagai API | Diterima | Client Component dibatasi pada interaksi; transaksi hanya di Go |
| ADR-005 | Provider port/adapter | Diterima | SDK dapat diganti dan diuji dengan fake |
| ADR-006 | Payment sandbox-only | Diterima | Tidak ada payout/refund uang nyata |
| ADR-007 | Inventory counter plus reservation record | Diterima | Membutuhkan transaction/locking |
| ADR-008 | Ticket dibuat setelah Paid | Diterima | Reservation bukan Ticket |
| ADR-009 | QR opaque dan server-validated | Diterima | Membutuhkan lookup hash dan koneksi |
| ADR-010 | Check-in online dan atomik | Diterima | Offline scan ditunda |
| ADR-011 | Deployment provider-neutral dan stateless | Diterima | Provider non-Vercel dipilih pada RFC-001; scheduler tidak boleh bergantung pada timer proses |
| ADR-012 | Strict sequential RFC delivery | Diterima | RFC berikutnya menunggu exit criteria |
| ADR-013 | Ekstensi komersial dipisahkan dan Deferred | Diterima | RFC-015–020 tidak aktif sampai Commercial Entry Gate disetujui |
| ADR-014 | Loyalty organizer-scoped berbasis reservation dan append-only ledger | Diterima | Nilai sandbox konsisten, tidak transferable/cashable, dan terintegrasi atomik dengan order/payment/refund |
| ADR-015 | AI provider-neutral dengan output tidak tepercaya | Diterima | F76/F77 memerlukan schema validation, deterministic guard, human review, fallback, dan provider decision gate |
| ADR-016 | Rekomendasi berbasis Published/future dan histori Paid milik buyer | Diterima | Personalisasi dibatasi category/location/organizer dengan contextual fallback |

## 20. Roadmap Implementasi Arsitektur

```mermaid
flowchart LR
  R1["RFC-001 Platform"] --> R2["RFC-002 Auth/RBAC"]
  R2 --> R3["RFC-003 Audit"]
  R3 --> R4["RFC-004 Organizer"]
  R4 --> R5["RFC-005 EventAuthoring/AI Draft"]
  R5 --> R6["RFC-006 EventLifecycle"]
  R6 --> R7["RFC-007 Catalog/NL Search"]
  R7 --> R8["RFC-008 Order/Inventory/Loyalty Reserve"]
  R8 --> R9["RFC-009 Payment/Refund/Loyalty Ledger"]
  R9 --> R10["RFC-010 Ticket/QR"]
  R10 --> R11["RFC-011 CheckIn"]
  R11 --> R12["RFC-012 Reporting/Recommendations"]
  R12 --> R13["RFC-013 Notification/Reminder"]
  R13 --> R14["RFC-014 Hardening"]
  R14 --> UAT["UAT and Academic Release"]
  UAT --> CEG{"Commercial Entry Gate"}
  CEG -->|approved| R15["RFC-015 Legal/Privacy/KYC"]
  R15 --> R16["RFC-016 ProductionPayment/Ledger"]
  R16 --> R17["RFC-017 Settlement/Payout"]
  R17 --> R18["RFC-018 Refund/Dispute"]
  R18 --> R19["RFC-019 Security/Fraud"]
  R19 --> R20["RFC-020 Reliability/Launch"]
  R20 --> GA["Commercial General Availability"]
  CEG -->|not_approved| Deferred["Remain Deferred"]
```

RFC-001–014 adalah jalur aktif MVP akademik. RFC-015–020 merupakan jalur kondisional: masing-masing bergantung pada seluruh RFC sebelumnya, UAT akademik, dan Commercial Entry Gate. Detail dependency dan exit criteria terdapat pada `RFC/RFCS.md`.

Kepemilikan ekspansi tidak menambah RFC: F76 berada di RFC-005; F20 dan F77 di RFC-007; F65 diselesaikan RFC-008 dengan fondasi authoring di RFC-005 dan integrasi lanjutan di RFC-006/007/009/010/011/012/014; F75 dibangun lintas RFC-008–009; F74 selesai di RFC-012 setelah histori Paid tersedia; F46 di RFC-012; F49–F51 di RFC-013; dan RFC-014 memvalidasi seluruh 66 fitur aktif.

### 20.1 Ekstensi Komersial Deferred

| RFC | Fokus | Aktivasi |
|---|---|---|
| RFC-015 | Legal, privasi, hak subjek data, dan KYC/KYB | Setelah Commercial Entry Gate |
| RFC-016 | Production payment dan immutable financial ledger | Dark mode; live charge tetap dilarang |
| RFC-017 | Settlement, payout, hold, dan reconciliation | Live payout tetap dilarang |
| RFC-018 | Refund produksi, chargeback, dispute, dan evidence | Provider production tetap nonaktif |
| RFC-019 | MFA, fraud prevention, pentest, dan incident response | Wajib lulus sebelum launch |
| RFC-020 | SLO/SLA, DR, support, progressive rollout, dan launch gate | Satu-satunya RFC yang dapat mengizinkan live traffic |

Pembuatan RFC tersebut hanya menyediakan desain agar proyek dapat berkembang tanpa merombak domain utama. F63, F64, dan F73 tetap Won’t Have pada MVP sampai prioritas produk diubah secara eksplisit. F65 adalah Must Have MVP, bukan bagian jalur komersial.

## 21. Risiko Arsitektur

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Upgrade stack mematahkan auth/build | Seluruh roadmap terblokir | Compatibility spike pada RFC-001 |
| Raw SQL/runtime DDL berbeda dari schema | Drift dan kehilangan data | goose sebagai satu jalur migrasi |
| OAuth linking tidak aman | Account takeover | Explicit safe linking pada RFC-002 |
| Race pada tiket terakhir | Overselling | Lock terurut, counter, constraint, concurrent test |
| Race pada kursi yang sama | Double-sell kursi | Unique hold aktif, lock `EventSeat`, error `SEAT_UNAVAILABLE`, concurrent test |
| Webhook duplikat/terlambat | Status/tiket ganda | Inbox unik, idempotensi, reconciliation |
| QR dibagikan atau dipindai bersamaan | Akses tidak sah | Token aman dan conditional update |
| Scheduler tidak andal | Kuota tertahan | External scheduler, retry, health metric |
| Provider belum dipilih | RFC terkait terblokir | Tutup decision gate sebelum RFC |
| Koneksi venue buruk | Antrean check-in | Pesan network jelas dan input manual; offline di luar MVP |
| Scope terlalu besar | Keterlambatan | Must Have dulu; potong Should/Could |
| RFC komersial dijalankan tanpa strategi | Risiko hukum/finansial | Pertahankan status Deferred dan wajibkan Commercial Entry Gate |
| Credential produksi aktif terlalu dini | Transaksi nyata tak terkendali | Dark mode RFC-016–019; aktivasi hanya melalui RFC-020 |
| Output AI salah atau terinjeksi | Draft/search menyesatkan atau boundary terlewati | Schema allowlist, deterministic validation, human review F76, parameterized repository F77, fallback |
| Provider AI berubah/mahal/tidak tersedia regional | F76/F77 tidak stabil atau biaya melampaui tier | Port/adapter, quota/cost telemetry, timeout, deterministic fallback, provider-neutral gate |
| Personalisasi membocorkan histori | Pelanggaran privasi buyer | Hanya histori Paid milik session buyer, agregasi server-side, tanpa sinyal lintas buyer |
| Race redemption/refund loyalty | Saldo negatif atau poin ganda | Row lock, reservation, unique idempotency reference, append-only compensating entry, concurrent test |
| Poin dianggap uang nyata | Scope akademik/finansial melebar | Label sandbox, no cash value, no transfer/payout, commercial ledger tetap Deferred |

## 22. Decision Gates Terbuka

| Batas Waktu | Keputusan |
|---|---|
| RFC-001 | Provider hosting non-Vercel, model deployment (container/PaaS/VPS), strategi migrasi/reset data prototype, dan hasil compatibility spike |
| RFC-005 | Provider object storage atau placeholder |
| Sebelum F76/F77 (paling lambat RFC-005) | Kontrak `AiInferencePort`, model/provider dan deterministic fake, evaluasi privasi/retensi, region, beta/SLA, quota/biaya, latency, fallback, dan exit strategy; Neon AI Gateway hanya kandidat |
| RFC-008 | Provider scheduler/cron |
| RFC-009 | Payment gateway sandbox dan kontrak webhook |
| RFC-013 | Email provider, sender/domain sandbox, quota, retry, dan bukti delivery; konfigurasi in-app-only tidak memenuhi gate |
| Sebelum RFC-015 | Commercial Entry Gate, strategi komersial, owner legal/finance/security/operations, anggaran, dan timeline |
| RFC-015–019 | Seluruh keputusan legal, payment, payout, refund, fraud, dan readiness tetap tanpa live traffic |
| RFC-020 | Persetujuan Commercial GA, live credential, progressive rollout, rollback, dan kill switch |

Gate AI tidak boleh memilih provider hanya karena integrasi mudah. Kriteria lulus harus berbukti pada Preview/Test dan provider harus dapat diganti tanpa mengubah domain. Jika gate tidak lulus, fallback manual/deterministik tetap memenuhi boundary keselamatan namun F76/F77 belum dapat dinyatakan lulus acceptance.

### 22.1 Quality Gate Ekspansi Aktif

- Unit: formula earn/redeem 20%, pembulatan, refund reversal/restoration, transition/idempotency, rekomendasi fallback, dan validator DTO AI.
- Integration PostgreSQL: checkout/redeem bersamaan, dua pembeli pada kursi yang sama, saldo terakhir, expiry versus payment, duplicate webhook, partial/full refund, ownership lintas organizer, serta unique ledger reference.
- Contract: deterministic fake dan adapter AI untuk valid/invalid schema, timeout, malformed output, prompt injection, quota/rate limit, dan provider failure.
- E2E: poster → reviewed Draft (tidak Published), natural-language → filter tervalidasi, rekomendasi hanya Published/future, dan loyalty earn → reserve → redeem → refund.
- Security/privacy: tidak ada SQL/event generation, auto-publish, cross-buyer history, cross-organizer points, PII/secret pada provider/log, atau bypass rate limit.
- RFC-014 mengulang seluruh regression, accessibility termasuk denah statis, browser, performance, observability, fallback, dan release/deployment gate untuk 66 fitur aktif.

Decision gate tidak boleh diselesaikan dengan menambah SDK secara sepihak. Keputusan harus dicatat sebagai ADR atau pembaruan RFC.

## 23. Panduan Developer Baru

1. Baca `prd-improved.md`, `features.md`, dan `RULES.md`.
2. Buka `RFC/RFCS.md` untuk mengetahui posisi implementasi.
3. Kerjakan hanya RFC aktif dan jangan mengimplementasikan kebutuhan RFC mendatang.
4. Ikuti dependency presentation → application → domain → ports.
5. Gunakan PostgreSQL, goose, dan sqlc/pgx; jangan menambah fallback file.
6. Tambahkan test yang menautkan ID fitur.
7. Jalankan lint, typecheck, test, migration check, dan build sebelum menyatakan selesai.
8. Catat asumsi atau keputusan arsitektur yang berubah.
9. Jangan menjalankan RFC-015–020 selama Commercial Entry Gate belum disetujui.

## 24. Referensi

- `prd-improved.md` — sumber kebutuhan produk utama.
- `features.md` — daftar fitur, prioritas, acceptance criteria, dan dependensi.
- `RULES.md` — standar pengembangan dan AI assistance.
- `RFC/RFCS.md` — roadmap implementasi sekuensial.
- `RFC/RFC-001.md` sampai `RFC/RFC-014.md` — spesifikasi aktif MVP akademik.
- `RFC/RFC-015.md` sampai `RFC/RFC-020.md` — rancangan komersial Deferred.
- `PRD.md` — dokumen awal dan konteks historis.
- Referensi industri GA vs zoned vs reserved seating: Tickera, Promotix, dan Addmi memakai hold 10–15 menit dan label kursi yang konsisten pada chart, tiket, serta check-in. MVP MyTicketIn mengikuti pola hold 15 menit dan konsistensi label, tetapi tetap memakai denah statis plus selector terpisah—bukan clickable map atau editor drag-and-drop.
