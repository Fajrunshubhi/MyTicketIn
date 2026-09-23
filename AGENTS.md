# AGENTS.md — Panduan Coding Agent MyTicketIn

Dokumen ini berlaku untuk seluruh repository. Gunakan sebagai petunjuk operasional ringkas; detail kebutuhan dan standar tetap berada pada dokumen sumber.

## 1. Misi Proyek

MyTicketIn adalah aplikasi web tiket event tatap muka untuk pembeli, organizer, petugas check-in, dan admin.

Target aktif adalah **MVP akademik**:

- Payment gateway sandbox dan data uji.
- Tidak menerima uang nyata.
- Tidak mengaktifkan payout atau refund finansial produksi.
- Deployment: Vercel untuk UI+API Next.js; migrasi SQL di `/migrations` dijalankan dengan `npm run migrate`.
- Runtime transaksi target adalah **Next.js Route Handlers + PostgreSQL**. `backend/` Go tetap referensi sampai checklist RFC-021 §5; jangan dihapus lebih awal.
- Implementasi fitur mengikuti RFC-001–RFC-014; pemindahan kode mengikuti RFC-021.
- Baseline produk `prd-improved.md` 2.2 memiliki 77 fitur: 57 Must, 5 Should, 4 Could, dan 11 Won’t; cakupan aktif MVP adalah 66 fitur.
- F20, F46, F49, F50, F51, F65, serta F74–F77 wajib. F42, F63–F64, dan F66–F73 tetap Won’t Have.

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

- Next.js 14, React 18, TypeScript 5, dan Tailwind CSS 3 pada UI prototype.
- Backend Go target belum menggantikan persistence runtime.
- Auth username/password serta Google tersedia sebagian (NextAuth prototype).
- Persistence masih menggunakan raw SQL dan fallback JSON.
- Prisma schema prototype bukan source of truth dan tidak dilanjutkan.
- Runtime DDL, seed credential, ID berbasis waktu, dan fallback secret harus dianggap technical/security debt.
- Domain event, order, payment, ticket, dan check-in belum tersedia.

Jangan menyatakan suatu fitur selesai hanya karena UI atau sebagian prototype sudah ada. Verifikasi terhadap acceptance criteria fitur dan RFC.

## 4. Mode Kerja Agent

### Sebelum Mengubah Kode

1. Identifikasi RFC dan ID fitur yang diminta.
2. Baca RFC aktif, `prd-improved.md` 2.2, bagian terkait dalam `features.md`, `RULES.md`, dan kode terdampak.
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
- Jangan menambah package atau provider SDK—termasuk AI—tanpa kebutuhan dan decision gate.
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

- Page dan Client Component tetap tipis; use case dan transaksi pindah ke Route Handler Next.js (`lib/server/...`) mengikuti RFC-021.
- Selama transisi, rewrite `/api` ke Go tetap default. Jangan daftarkan `app/api` yang menimpa path Go sebelum modul Next paritas.
- Application service mengorkestrasi use case dan transaction (Go sekarang; Next.js setelah modul dipindah).
- Domain berisi invariant serta transisi status dan tidak mengimpor framework UI.
- Repository mengenkapsulasi PostgreSQL (pgx/sqlc di Go; driver Neon/`pg` di Next setelah port).
- Provider adapter mengenkapsulasi payment, storage, email, analytics, scheduler, dan AI.
- Module lain menggunakan public application contract, bukan infrastructure internal.

Gunakan React Server Components secara default. `"use client"` hanya untuk interaksi browser seperti scanner, form dinamis, dan dialog.

## 6. Struktur Kode Target

```text
migrations/       # goose SQL 0001–0018; runner npm run migrate
backend/          # referensi transisi RFC-021; jangan dihapus sebelum §5
  cmd/api/
  internal/...
app/
  api/            # Route Handler Next
lib/server/
components/
tests/
  e2e/
```

Di dalam module, gunakan `domain/`, `application/`, `infrastructure/`, dan `ui/` hanya jika ada implementasi nyata. Jangan membuat folder atau abstraction placeholder.

## 7. Konvensi

- Komponen dan file React: `PascalCase`.
- Route/folder dan file non-komponen: `kebab-case`.
- Fungsi/variabel: `camelCase`.
- Type/interface/class: `PascalCase`.
- Konstanta dan environment variable: `UPPER_SNAKE_CASE`.
- Database: `snake_case`, dipetakan melalui sqlc (Go) atau query typed di `lib/server` (Next).
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
- Update/delete histori ledger loyalitas.

Gunakan:

- File goose terversi di `/migrations` dan runner `npm run migrate` (tabel `goose_db_version`); query typed di `lib/server`.
- CUID/UUID non-predictable.
- Integer Rupiah.
- UTC/`TIMESTAMPTZ`.
- Snapshot harga/nama/kategori/kursi pada OrderItem.
- Transaction, unique/check constraint, dan conditional update.
- Ledger loyalitas append-only serta entry kompensasi.

Invariant wajib:

1. `paidQuantity + reservedQuantity <= quota`.
2. Counter inventori tidak negatif.
3. Satu external payment reference hanya untuk satu Payment.
4. Webhook provider diproses efektif satu kali.
5. Satu unit order Paid menghasilkan tepat satu Ticket.
6. Satu Ticket memiliki paling banyak satu check-in berhasil.
7. Event Cancelled tidak kembali Published.
8. Organizer hanya mengakses data event miliknya.
9. Poin terisolasi per buyer–organizer, tidak dapat dipindahkan/diuangkan, tidak kedaluwarsa, dan tidak memiliki nilai tunai.
10. Earn 1 poin per Rp1.000 net paid; redeem Rp10 per poin maksimum 20% order; seluruh aritmetika integer.
11. Order dan reservasi poin dibuat atomik; Failed/Expired/Cancelled melepaskan reservasi tepat satu kali.
12. Paid mengonversi reservasi menjadi ledger debit dan memberikan earned points tepat satu kali.
13. Refund Completed membalik earned points; full Refund Completed memulihkan redeemed points melalui entry kompensasi.
14. Rekomendasi dan AI search hanya mengembalikan event Published yang akan datang.
15. AI tidak menghasilkan SQL/event dan tidak boleh auto-submit, auto-approve, atau auto-publish.
16. Setiap event memiliki tepat satu mode inventori yang immutable setelah commerce.
17. Satu `EventSeat` paling banyak memiliki satu hold aktif atau satu Ticket Paid; hold berlangsung 15 menit.

## 9. API dan State

- Validasi seluruh boundary menggunakan Zod.
- Periksa session, role, capability, ownership, **portal login**, dan status domain pada server.
- Portal `buyer` \| `organizer` \| `admin` adalah intent UI, bukan role database. Pendaftaran hanya pembeli. Pengajuan organizer setelah masuk sebagai pembeli. Portal `organizer` hanya profil `APPROVED`.
- Gunakan typed error dan envelope standar dari `RULES.md`.
- Gunakan pagination untuk koleksi yang dapat tumbuh.
- Gunakan idempotency key untuk checkout, webhook, dan operasi sensitif.
- URL adalah source of truth untuk filter/search/page.
- PostgreSQL adalah source of truth untuk inventory/order/payment/ticket.
- PostgreSQL adalah source of truth untuk event, recommendation candidates, dan loyalty; AI hanya menghasilkan saran draft atau filter tervalidasi.
- Optimistic update dilarang untuk inventory, seat hold, payment, refund, dan check-in.
- Optimistic update juga dilarang untuk saldo/reservasi poin.
- Katalog publik boleh di-cache dengan invalidation; state transaksi tidak boleh.

## 10. Security Non-Negotiables

- Jangan hardcode secret, credential, password demo, atau role admin.
- Aplikasi harus fail-fast jika secret wajib tidak tersedia.
- Jangan memakai dangerous automatic OAuth account linking.
- Hash password secara asynchronous dengan adaptive cost.
- Terapkan rate limit pada auth, checkout, webhook, scanner, dan reset password.
- Terapkan rate limit/quota pada AI poster scan dan natural-language search.
- Verifikasi signature webhook dari payload yang benar.
- QR harus opaque, tidak memuat PII, dan divalidasi pada server.
- Jangan log password, cookie, token OAuth, token QR, atau connection string.
- Jangan log gambar poster, OCR/prompt/output mentah, natural-language query, atau data ledger yang memuat PII/rahasia.
- Terapkan RBAC serta object-level authorization pada setiap mutasi/query sensitif.
- Perlakukan gambar poster, OCR, teks pencarian, dan output AI sebagai input tidak tepercaya; validasi MIME/ukuran/schema/allowlist dan cegah prompt injection memicu tool, SQL, atau mutasi.
- F76 hanya memberi saran terstruktur untuk human review/apply/save; F77 hanya memetakan intent ke filter dan wajib fallback ke search standar saat AI gagal.
- Jangan memakai credential payment produksi pada MVP.
- Jangan melakukan operasi git/database destruktif tanpa persetujuan.

Jika menemukan credential bocor, broken authorization, invariant finansial/loyalty yang dapat dilanggar, kebocoran lintas buyer–organizer, atau AI yang dapat melakukan SQL/mutasi tanpa validasi, hentikan pekerjaan terkait dan laporkan sebagai blocker.

## 11. Testing dan Quality Gates

Minimal:

- Unit test untuk policy, perhitungan integer loyalty, AI filter/schema, dan transisi status.
- Integration test PostgreSQL untuk transaction, authorization, loyalty, recommendation, dan Published-only retrieval.
- E2E untuk alur lintas module.
- Contract test serta deterministic fake untuk provider.
- Regression test untuk setiap bug fix.

Coverage:

- Global: minimal 80% lines/functions dan 75% branches.
- Inventory, order, payment, loyalty, ticket, check-in, dan authorization: minimal 90% branches.

Kasus kritis:

- Checkout bersamaan pada tiket terakhir atau kursi yang sama.
- Checkout retry/idempotency.
- Webhook invalid, duplikat, terlambat, dan out-of-order.
- Ticket issuance tepat satu kali.
- Dua scan tiket yang sama secara bersamaan.
- Akses lintas organizer.
- Expiry beradu dengan webhook sukses.
- Dua checkout mereservasi poin yang sama; release/convert poin beradu dengan expiry/webhook.
- Replay Paid/refund tidak menggandakan loyalty debit, earn, reversal, atau restore.
- Full refund memulihkan redeemed points; completed refund membalik earned points.
- Rekomendasi dengan/tanpa riwayat Paid dan tidak pernah memuat event non-Published/past.
- Poster/query berbahaya, output AI invalid, prompt injection, timeout/rate limit, redaksi, serta provider failure/fallback.
- F76 terbukti tidak auto-submit/publish; F77 tidak menghasilkan SQL dan PostgreSQL tetap memilih hasil.

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
- Denah venue memakai alt text/legenda; selector kursi terpisah harus dapat digunakan dengan keyboard.

## 13. Deployment dan Provider

- Deployment belum tersedia.
- Vercel bukan target.
- Provider non-Vercel dipilih pada RFC-001.
- Provider harus mendukung binary Go, UI Next.js, HTTPS, webhook, secret, health check, migration, logging, dan rollback.
- Scheduler harus eksternal atau disediakan platform; timer in-process dilarang.
- Development, Preview/Test, dan Production Demo harus terisolasi.
- Jangan memilih payment, storage, scheduler, email, analytics, atau AI SDK sebelum gate terkait disetujui.
- AI harus menggunakan port provider-neutral. Gate AI mencakup model/provider, structured output, retensi/penghapusan, PII redaction, rate limit/quota, biaya, timeout, dan observability.

## 14. Urutan RFC

Jalur aktif:

```text
RFC-001 → RFC-002 → ... → RFC-014 → UAT akademik
```

Jalur komersial:

```text
Commercial Entry Gate → RFC-015 → ... → RFC-020 → Commercial GA
```

RFC-015–020 tetap Deferred. F42, F63–F64, dan F66–F73 tetap Won’t Have. F65 dimiliki RFC-008 dengan fondasi authoring di RFC-005. F76 dimiliki RFC-005, F77 RFC-007, F75 dibangun lintas RFC-008–009, dan F74 diselesaikan RFC-012 setelah histori Paid tersedia. Pemetaan ini bukan izin memilih SDK/provider AI tanpa gate.

## 15. Definition of Done

Fitur dianggap selesai jika:

1. Acceptance criteria dan ID fitur terpenuhi.
2. Seluruh predecessor dan dependency telah tersedia.
3. Happy path, failure path, authorization, dan edge case ditangani.
4. Test proporsional tersedia dan lulus.
5. Invariant database tetap terjaga.
6. Fitur loyalty membuktikan isolasi, konkurensi reservasi, idempotensi ledger, dan reversal/restore refund.
7. Fitur AI membuktikan output validation, human control/fallback, rate limit, retensi/redaksi, serta provider contract dengan fake deterministik.
8. Fitur kursi bernomor membuktikan hold 15 menit, satu kursi satu hold/Paid, snapshot label, denah statis aksesibel, dan concurrent same-seat test.
9. Logging/analytics tidak membocorkan data sensitif.
10. UI yang relevan telah diperiksa untuk mobile dan accessibility.
11. Migration, dokumentasi, dan rollback diperbarui.
12. Tidak ada TODO, placeholder, hardcoded secret, debug code, atau defect kritis.

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
