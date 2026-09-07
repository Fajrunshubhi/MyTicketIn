# Product Requirements Document — TicketIn

| Atribut | Nilai |
|---|---|
| **Versi** | 2.0 |
| **Status** | Baseline implementasi MVP akademik |
| **Platform** | Web responsif |
| **Pasar sasaran** | Indonesia, event tatap muka |
| **Horizon rilis** | 12 minggu, tanggal kalender TBD |
| **Model MVP** | Validasi alur dengan payment gateway sandbox; tanpa uang nyata |
| **Pemilik keputusan** | Product Owner/peneliti — nama TBD |

> **Batas penting:** MVP ini menguji alur produk menggunakan transaksi sandbox. Penerimaan uang nyata, settlement/payout organizer, refund finansial nyata, dan peluncuran komersial memerlukan keputusan legal, operasional, dan payment gateway terpisah.

## 1. Ringkasan Eksekutif

TicketIn adalah platform web untuk membuat, menemukan, membeli, dan memvalidasi tiket event tatap muka. Organizer dapat mengelola beberapa event dan inventori tiket; pembeli dapat mencari event, melakukan pembayaran sandbox, menerima e-ticket QR, dan melihat riwayat tiket; admin memoderasi organizer/event serta mengawasi transaksi; petugas melakukan check-in satu kali.

**Hipotesis produk:** jika penjualan, status pembayaran, inventori, dan check-in dikelola dalam satu sistem, organizer dapat mengurangi pekerjaan rekap dan risiko tiket ganda, sementara pembeli memperoleh pengalaman yang lebih jelas dan tepercaya.

## 2. Visi, Masalah, dan Nilai

### 2.1 Visi

Menjadi fondasi pengelolaan tiket event Indonesia yang sederhana dan tepercaya, dari publikasi event hingga peserta masuk venue.

### 2.2 Pernyataan Masalah

Organizer yang menggunakan formulir, pesan pribadi, dan transfer manual harus merekonsiliasi pesanan, pembayaran, kuota, dan kehadiran secara terpisah. Akibatnya, data mudah tidak sinkron, kuota sulit dikontrol, dan tiket dapat digunakan ulang. Pembeli juga kesulitan mengetahui status pembayaran dan menemukan kembali tiketnya.

### 2.3 Nilai per Pengguna

| Pengguna | Kebutuhan | Nilai TicketIn |
|---|---|---|
| **Pembeli** | Menemukan event dan memperoleh tiket yang valid tanpa ketidakjelasan status | Katalog terpusat, checkout, status pembayaran, dan tiket QR |
| **Organizer** | Menjual tiket tanpa rekap manual dan memantau kehadiran | Inventori atomik, dashboard, serta check-in terintegrasi |
| **Petugas** | Memvalidasi peserta dengan cepat dan pasti | Scanner dengan hasil Valid/Used/Invalid yang tegas |
| **Admin** | Mengendalikan kualitas dan menelusuri insiden | Moderasi, pencarian data operasional, serta audit log |

## 3. Tujuan dan Non-Tujuan

### 3.1 Tujuan MVP

1. Membuktikan alur organizer dari pembuatan event sampai pemantauan check-in.
2. Membuktikan alur pembeli dari pencarian sampai memperoleh tiket setelah pembayaran sandbox.
3. Menjamin kuota tidak terjual melebihi batas pada profil beban uji.
4. Menjamin satu tiket hanya dapat berhasil di-check-in satu kali.
5. Mengukur kegunaan produk melalui tugas pengguna dan System Usability Scale (SUS).

### 3.2 Non-Tujuan MVP

- Mengoperasikan marketplace tiket komersial atau menerima uang nyata.
- Menyediakan settlement/payout organizer dan rekonsiliasi finansial produksi.
- Menangani kursi bernomor, resale, transfer tiket, voucher, atau dynamic pricing.
- Mendukung event online/hybrid, multi-negara, multi-mata uang, atau aplikasi mobile native.
- Menyediakan scanner offline atau integrasi perangkat turnstile.
- Menyatakan kepatuhan produksi hanya berdasarkan pengujian akademik.

## 4. Persona dan Jobs to Be Done

### 4.1 Pembeli — “Raka”

- **Konteks:** mencari event melalui ponsel dan terbiasa dengan QRIS/e-wallet.
- **Tujuan:** membeli tiket yang tersedia dan membukanya kembali saat hari acara.
- **JTBD:** “Ketika menemukan event yang ingin saya hadiri, saya ingin mengetahui harga dan ketersediaannya, menyelesaikan pembayaran, lalu memperoleh tiket yang statusnya jelas.”

### 4.2 Organizer — “Nadia”

- **Konteks:** mengelola beberapa event dengan kelas dan kuota tiket berbeda.
- **Tujuan:** menerbitkan event, memantau penjualan, dan mengetahui jumlah peserta hadir.
- **JTBD:** “Ketika menjual tiket, saya ingin kuota dan pembayaran diperbarui otomatis agar tidak perlu merekap manual atau menerima pesanan berlebih.”

### 4.3 Petugas Check-in — “Dimas”

- **Konteks:** bekerja di pintu masuk menggunakan kamera ponsel dan koneksi internet.
- **Tujuan:** memproses antrean dengan hasil validasi yang tidak ambigu.
- **JTBD:** “Ketika peserta menunjukkan QR, saya ingin mengetahui dalam hitungan detik apakah tiket dapat diterima.”

### 4.4 Admin — “Ayu”

- **Konteks:** mengawasi organizer, event, transaksi sandbox, dan insiden.
- **Tujuan:** mencegah penyalahgunaan serta mengetahui siapa melakukan perubahan.
- **JTBD:** “Ketika terjadi pengajuan atau masalah transaksi, saya ingin melihat data dan riwayat tindakan agar dapat mengambil keputusan yang konsisten.”

## 5. Keputusan Produk MVP

Keputusan berikut menjadi baseline implementasi. Perubahan harus dicatat sebagai perubahan cakupan.

| Area | Keputusan MVP |
|---|---|
| **Akun** | Satu akun biasa dapat membeli tiket dan mengajukan profil organizer; ADMIN adalah peran terpisah |
| **Verifikasi organizer** | Admin menyetujui nama organizer, kontak, dan deskripsi; verifikasi legal/KYC bukan bagian demo akademik |
| **Moderasi event** | Event harus disetujui admin sebelum Published |
| **Tipe event** | Tatap muka, tanpa pemilihan kursi |
| **Pembayaran** | Satu payment gateway sandbox; QRIS, virtual account, dan e-wallet jika tersedia dalam akun sandbox |
| **Reservasi kuota** | 15 menit sejak order dibuat; setelah itu order Expired dan kuota dilepas |
| **Batas pembelian** | Maksimal 5 tiket per jenis tiket per akun per event |
| **Tiket** | Satu unit tiket menghasilkan satu QR unik setelah order Paid |
| **Check-in** | Online; hanya organizer pemilik event atau petugas yang diberi akses |
| **Pembatalan/refund** | Admin mencatat siklus refund sandbox; tidak ada pengembalian uang nyata |
| **Notifikasi** | In-app wajib; email bersifat Should Have |
| **Bahasa/mata uang** | Bahasa Indonesia dan Rupiah |
| **Data pengujian** | Gunakan akun dan transaksi uji; hindari dokumen identitas nyata |

## 6. Ruang Lingkup dengan MoSCoW

### 6.1 Must Have

- Registrasi/login, logout, sesi, dan otorisasi server-side.
- Pengajuan dan persetujuan profil organizer.
- CRUD draft event, moderasi, publikasi, dan pembatalan.
- Beberapa jenis tiket per event dengan harga, kuota, dan periode penjualan.
- Katalog, pencarian kata kunci, detail event, dan filter dasar.
- Checkout satu event, reservasi kuota, order, dan pembayaran sandbox.
- Webhook pembayaran yang terverifikasi dan idempoten.
- Penerbitan e-ticket QR setelah status Paid.
- Daftar tiket pembeli.
- Scanner online dan check-in atomik satu kali.
- Dashboard minimum organizer dan admin.
- Audit log untuk moderasi, perubahan status pembayaran, pembatalan, refund, dan check-in.
- Penanganan error utama: stok habis, order kedaluwarsa, webhook ganda, QR salah event, QR used, serta akses tanpa izin.

### 6.2 Should Have

- Email konfirmasi pembayaran, tiket, dan pembatalan.
- Petugas check-in terpisah yang dapat diberi/dicabut akses per event.
- Input kode tiket manual saat kamera gagal.
- Ekspor peserta dan check-in ke CSV.
- Filter katalog berdasarkan kategori, lokasi, dan tanggal.
- Pencatatan refund sandbox dengan status lengkap.
- Reset kata sandi.

### 6.3 Could Have

- Pratinjau event sebelum diajukan.
- Grafik penjualan sederhana.
- Reminder menjelang event.
- Pencarian admin lintas entitas.
- Penghentian penjualan per jenis tiket.

### 6.4 Won’t Have pada Rilis Ini

- Transaksi uang nyata, payout, atau refund finansial nyata.
- Kursi bernomor, kode promo, waiting list, resale, dan transfer tiket.
- Event online/hybrid, aplikasi native, dan scanner offline.
- Multi-bahasa, multi-mata uang, dan monetisasi.

## 7. User Stories dan Kriteria Penerimaan

### US-01 — Akses dan Peran

**Sebagai pengguna, saya ingin login dengan aman agar dapat mengakses fitur sesuai kewenangan saya.**

**MoSCoW:** Must Have

- **Given** kredensial valid, **when** pengguna login, **then** sistem membuat sesi dan mengarahkan ke halaman yang diizinkan.
- **Given** pengguna tanpa peran organizer, **when** memanggil aksi organizer secara langsung, **then** server menolak dengan status akses yang sesuai.
- **Given** sesi berakhir atau pengguna logout, **when** halaman terproteksi dibuka, **then** pengguna diminta login kembali.

### US-02 — Pengajuan Organizer

**Sebagai pengguna, saya ingin mengajukan profil organizer agar dapat membuat event.**

**MoSCoW:** Must Have

- **Given** profil organizer belum ada, **when** nama, kontak, dan deskripsi valid dikirim, **then** status menjadi Pending.
- **Given** pengajuan Pending, **when** admin menyetujui, **then** pengguna memperoleh kemampuan organizer.
- **Given** admin menolak, **when** organizer melihat status, **then** alasan penolakan ditampilkan.

### US-03 — Pembuatan dan Moderasi Event

**Sebagai organizer, saya ingin membuat beberapa event dan mengajukannya agar event yang layak dapat tampil di katalog.**

**MoSCoW:** Must Have

- **Given** organizer Approved, **when** data wajib dan minimal satu jenis tiket valid disimpan, **then** event dapat diajukan.
- **Given** event Pending Review, **when** admin menyetujui, **then** status menjadi Published dan event tampil di katalog.
- **Given** event Rejected, **when** organizer membuka event, **then** alasan terlihat dan event dapat diperbaiki lalu diajukan ulang.
- Event yang sudah memiliki order Paid tidak boleh dihapus; hanya dapat dibatalkan.

### US-04 — Inventori Tiket

**Sebagai organizer, saya ingin menentukan harga, kuota, dan periode penjualan agar penjualan mengikuti kapasitas event.**

**MoSCoW:** Must Have

- Harga berupa bilangan Rupiah ≥ 0 dan kuota berupa bilangan bulat positif.
- Waktu mulai penjualan harus lebih awal daripada waktu selesai dan waktu event.
- Ketersediaan dihitung sebagai `kuota - paid - reservasi_aktif`.
- Perubahan harga tidak mengubah item order yang telah dibuat.
- Penurunan kuota tidak boleh lebih kecil dari jumlah Paid dan reservasi aktif.

### US-05 — Penemuan Event

**Sebagai pengunjung, saya ingin mencari dan membaca detail event agar dapat memutuskan tiket yang akan dibeli.**

**MoSCoW:** Must Have

- Hanya event Published yang muncul di katalog.
- Pencarian kata kunci mencocokkan minimal nama event.
- Detail menampilkan organizer, deskripsi, waktu, lokasi, syarat, jenis tiket, harga, periode penjualan, dan status ketersediaan.
- Event Cancelled atau Completed tidak dapat memulai checkout.

### US-06 — Checkout dan Reservasi

**Sebagai pembeli, saya ingin memilih tiket dan memperoleh waktu pembayaran agar kuota tidak direbut saat saya membayar.**

**MoSCoW:** Must Have

- **Given** kuota tersedia, **when** checkout dibuat, **then** sistem membuat order Pending dan reservasi selama 15 menit.
- **Given** sisa kuota tidak cukup, **when** checkout diproses, **then** sistem menolak tanpa membuat reservasi parsial.
- **Given** order melewati 15 menit tanpa Paid, **when** proses kedaluwarsa berjalan, **then** status menjadi Expired dan kuota dilepas.
- Permintaan checkout ganda dengan idempotency key yang sama tidak membuat dua order.

### US-07 — Pembayaran Sandbox

**Sebagai pembeli, saya ingin membayar dengan metode yang familiar agar order dapat dikonfirmasi.**

**MoSCoW:** Must Have

- Sistem membuat transaksi sandbox untuk nominal yang sama dengan total order.
- Callback dengan signature tidak valid ditolak dan dicatat tanpa mengubah order.
- Callback yang sama dapat diterima berulang tanpa membuat tiket ganda.
- Hanya status sukses tepercaya yang mengubah order menjadi Paid.
- Callback sukses yang datang setelah order Expired masuk antrean rekonsiliasi admin dan tidak menerbitkan tiket otomatis.

### US-08 — Penerbitan dan Akses Tiket

**Sebagai pembeli, saya ingin menerima QR unik setelah pembayaran agar dapat masuk event.**

**MoSCoW:** Must Have

- Jumlah tiket Issued sama dengan jumlah unit pada order Paid.
- Setiap QR menggunakan token acak/ditandatangani yang unik dan tidak mengekspos data pribadi.
- Tiket menampilkan event, jenis tiket, pemilik order, dan status Unused/Used/Cancelled.
- Order Pending, Failed, atau Expired tidak menghasilkan tiket.

### US-09 — Check-in

**Sebagai petugas, saya ingin memindai QR agar hanya tiket yang sah dapat digunakan.**

**MoSCoW:** Must Have

- QR Unused untuk event dan petugas yang benar menghasilkan Valid lalu berubah atomik menjadi Used.
- Dua pemindaian bersamaan terhadap tiket yang sama hanya menghasilkan satu keberhasilan.
- QR Used menghasilkan Already Used beserta waktu penggunaan pertama.
- QR event lain, tidak dikenal, Cancelled, atau terkait order tidak Paid ditolak dengan alasan yang sesuai.
- Setiap percobaan menyimpan event, tiket bila dikenali, petugas, waktu, dan hasil.

### US-10 — Dashboard Organizer

**Sebagai organizer, saya ingin melihat performa tiap event agar dapat memantau operasi.**

**MoSCoW:** Must Have

- Organizer hanya dapat melihat event miliknya.
- Ringkasan menampilkan order Paid, tiket terjual, pendapatan sandbox bruto, dan check-in.
- Angka ringkasan konsisten dengan data transaksi sumber.

### US-11 — Administrasi dan Audit

**Sebagai admin, saya ingin memoderasi serta menelusuri perubahan agar insiden dapat diselesaikan.**

**MoSCoW:** Must Have

- Admin dapat menyetujui/menolak organizer dan event dengan alasan.
- Admin dapat membatalkan event dan mencatat refund sandbox.
- Audit log menyimpan aktor, aksi, entitas, waktu, serta nilai status sebelum/sesudah.
- Audit log tidak dapat diubah melalui antarmuka aplikasi.

### US-12 — Pembatalan dan Refund Sandbox

**Sebagai admin, saya ingin mencatat pembatalan serta refund sandbox agar status tiket dan transaksi tetap konsisten.**

**MoSCoW:** Must Have untuk pembatalan; Should Have untuk integrasi refund gateway

- Event Cancelled tidak menerima checkout baru.
- Tiket Unused dari order terdampak menjadi Cancelled setelah pembatalan disetujui.
- Tiket Used tidak dapat diubah menjadi Unused melalui proses refund biasa.
- Catatan refund menyimpan nominal, alasan, status, admin, dan referensi provider bila ada.
- Pengembalian uang nyata berada di luar cakupan.

## 8. Alur Utama dan Alur Kegagalan

### 8.1 Jalur Organizer

`Daftar/Login → Ajukan organizer → Persetujuan admin → Buat event → Tambah jenis tiket → Ajukan event → Persetujuan admin → Published → Pantau penjualan/check-in`

Alur kegagalan:

- Pengajuan ditolak → alasan tampil → organizer memperbaiki dan mengajukan ulang.
- Event sudah memiliki order Paid → penghapusan ditolak → gunakan pembatalan.
- Periode penjualan tidak valid → event tidak dapat diajukan.

### 8.2 Jalur Pembeli

`Katalog → Detail event → Pilih tiket → Login → Reservasi 15 menit → Pembayaran sandbox → Webhook Paid → Tiket QR`

Alur kegagalan:

- Kuota habis saat checkout → order tidak dibuat dan pengguna diminta memilih ulang.
- Pembayaran gagal → order Failed dan kuota dilepas.
- Waktu habis → order Expired dan pembeli harus checkout ulang.
- Callback terlambat setelah Expired → admin merekonsiliasi; tiket tidak diterbitkan otomatis.

### 8.3 Jalur Check-in

`Login petugas → Pilih event → Scan QR → Validasi server → Valid dan Used / Ditolak dengan alasan`

Alur kegagalan:

- Kamera gagal → petugas menggunakan input kode manual jika Should Have tersedia.
- Koneksi putus → tampilkan kegagalan koneksi; jangan menandai tiket Used secara lokal.
- Scan ganda bersamaan → hanya satu transaksi database berhasil.

## 9. Aturan Domain dan Status

### 9.1 Status

| Entitas | Status yang Diizinkan |
|---|---|
| **Organizer** | Pending, Approved, Rejected, Suspended |
| **Event** | Draft, PendingReview, Published, Rejected, Cancelled, Completed |
| **Order** | Pending, Paid, Failed, Expired, Cancelled, Refunded |
| **Payment** | Created, Pending, Succeeded, Failed, Expired, Refunded |
| **Ticket** | Unused, Used, Cancelled |
| **Refund** | Requested, Approved, Rejected, Processing, Completed, Failed |

Reservasi inventori adalah entitas/record terpisah yang terkait dengan Order, bukan status Ticket. Ticket baru dibuat setelah Order Paid.

### 9.2 Invarian

1. `paid_quantity + active_reservation_quantity ≤ ticket_type.quota`.
2. Satu referensi payment provider hanya boleh terkait dengan satu Payment.
3. Satu unit item order Paid menghasilkan tepat satu Ticket.
4. Satu Ticket hanya memiliki paling banyak satu check-in berhasil.
5. Organizer tidak dapat membaca data peserta event milik organizer lain.
6. Event Cancelled tidak dapat kembali menjadi Published.
7. Status berubah hanya melalui transisi yang diizinkan dan tercatat.

## 10. Persyaratan Data

| Entitas | Data Minimum |
|---|---|
| **User** | ID, nama, username, email, password hash/Google ID, status |
| **Role/Permission** | user, organizer capability, admin, assignment petugas |
| **OrganizerProfile** | owner, nama, kontak, deskripsi, status, alasan keputusan |
| **Event** | organizer, nama, deskripsi, kategori, gambar, venue, alamat, waktu, status |
| **TicketType** | event, nama, harga, kuota, jadwal penjualan, limit |
| **Order/OrderItem** | pembeli, snapshot item/harga, total, expiry, status |
| **InventoryReservation** | order, ticket type, jumlah, expiry, released timestamp |
| **Payment** | order, provider, external reference, metode, nominal, status, payload hash |
| **Ticket** | order item, event, token hash, status, issued timestamp |
| **CheckInAttempt** | ticket nullable, event, petugas, hasil, timestamp |
| **Refund** | order/payment, nominal, alasan, status, referensi provider |
| **AuditLog** | aktor, aksi, entitas, before/after terfilter, timestamp |
| **Notification** | penerima, tipe, isi, status baca/kirim |

Data kartu atau kredensial pembayaran tidak boleh disimpan.

## 11. Persyaratan Teknis dan Integrasi

### 11.1 Baseline Teknologi

- **Aplikasi:** Next.js 14, React, dan TypeScript.
- **Autentikasi:** NextAuth; username/kata sandi dan Google.
- **Database:** PostgreSQL pada Neon; migrasi skema terversi.
- **Hosting:** deployment web terkelola yang mendukung Next.js.
- **Payment:** satu adapter gateway sandbox agar provider dapat diganti tanpa mengubah domain Order.
- **QR:** token minimal 128-bit entropy atau payload yang ditandatangani; database menyimpan hash token bila memungkinkan.

### 11.2 Komponen Infrastruktur

| Komponen | Kebutuhan |
|---|---|
| **Web runtime** | Menjalankan UI, API, autentikasi, dan webhook |
| **PostgreSQL** | Transaksi atomik, constraint, indeks, backup |
| **Object storage** | Gambar event; file tidak disimpan di filesystem runtime |
| **Scheduler/cron** | Mengakhiri reservasi dan order yang melewati 15 menit |
| **Payment sandbox** | Checkout, status, signature webhook, dan refund sandbox bila tersedia |
| **Email provider** | Hanya untuk fitur Should Have |
| **Observability** | Structured log, error tracking, health check, dan metrik webhook |

### 11.3 Transaksi Kritis

- Reservasi kuota menggunakan transaksi database dan atomic conditional update/locking.
- Penerbitan tiket berjalan dalam transaksi yang terikat pada perubahan pertama Order ke Paid.
- Check-in menggunakan conditional update `Unused → Used`; hasil update nol berarti tiket sudah digunakan/tidak valid.
- Webhook disimpan dengan event ID unik untuk idempotensi dan audit.
- Job kedaluwarsa aman dijalankan berulang.

## 12. Persyaratan Non-Fungsional

### 12.1 Profil Uji

Target berikut berlaku pada lingkungan preview yang menyerupai deployment MVP:

- Event dengan 5.000 tiket.
- 50 pembeli aktif bersamaan saat checkout.
- 10 petugas melakukan scan bersamaan.
- Durasi load test minimal 15 menit.

### 12.2 Kinerja dan Keandalan

| ID | Persyaratan | Verifikasi |
|---|---|---|
| NFR-01 | Respons server katalog/detail **p95 ≤ 2 detik** | Load test profil uji |
| NFR-02 | Validasi QR online **p95 ≤ 1,5 detik** | 10 scanner bersamaan |
| NFR-03 | Tidak ada overselling | Uji kuota terakhir secara konkurensi |
| NFR-04 | Tidak ada check-in berhasil ganda | Uji scan bersamaan |
| NFR-05 | Webhook duplikat tidak membuat tiket ganda | Integration test replay |
| NFR-06 | Backup tersedia dengan RPO 24 jam dan prosedur restore terdokumentasi | Restore drill sebelum rilis |

Target availability produksi tidak ditetapkan untuk demo akademik. Pilot komersial harus menetapkan SLA, RTO, RPO, dan kapasitas baru berdasarkan beban nyata.

### 12.3 Keamanan

- HTTPS pada deployment; cookie sesi `HttpOnly`, `Secure`, dan kebijakan SameSite yang sesuai.
- Hash kata sandi adaptif dan rate limit login, registrasi, checkout, scan, serta webhook.
- Validasi input server-side dan proteksi OWASP Top 10 yang relevan.
- RBAC dan pemeriksaan kepemilikan objek pada setiap aksi organizer/petugas.
- Verifikasi signature webhook dan rotasi rahasia melalui environment variable.
- QR tidak memuat PII dan tidak dapat ditebak.
- Audit log untuk aksi sensitif; payload webhook/log disensor dari rahasia dan PII.
- Tidak ada temuan Critical/High yang terbuka pada dependency scan dan review sebelum rilis.

### 12.4 Privasi, Regulasi, dan Aksesibilitas

- MVP menggunakan data uji; penggunaan data nyata memerlukan pemberitahuan privasi dan dasar pemrosesan sesuai UU PDP.
- Organizer hanya melihat data minimum peserta event miliknya.
- Kebijakan retensi, penghapusan akun, syarat organizer, kebijakan pembatalan, dan penanggung jawab data wajib disetujui sebelum pilot nyata.
- Alur utama menargetkan WCAG 2.1 AA: keyboard, label, fokus, kontras, dan pesan error.
- Mendukung dua versi terbaru Chrome, Edge, Firefox, dan Safari; scanner wajib diuji pada Chrome Android.

## 13. Analitik dan Metrik Keberhasilan

### 13.1 Event Analitik Minimum

- `organizer_application_submitted/approved/rejected`
- `event_created/submitted/published/rejected/cancelled`
- `checkout_started/order_created/order_expired`
- `payment_succeeded/payment_failed/webhook_rejected`
- `ticket_issued/ticket_viewed`
- `checkin_succeeded/checkin_rejected` dengan reason code

Event analitik tidak boleh mengirim token QR, password, atau data pribadi yang tidak diperlukan.

### 13.2 Target MVP

| Metrik | Metode | Target |
|---|---|---|
| Kelulusan Must Have | UAT dan test report | 100% |
| Task completion | Minimal 5 peserta menjalankan tugas inti | ≥ 90% tugas selesai tanpa bantuan langsung |
| SUS | Kuesioner setelah uji | ≥ 68 |
| Overselling | Concurrent integration test | 0 |
| Check-in ganda | Concurrent integration test | 0 |
| Akurasi webhook | Skenario sukses, gagal, expired, duplikat, signature salah | 100% skenario wajib lulus |
| Defect blocker/critical | Defect log | 0 terbuka |
| Security Critical/High | Scan dan checklist | 0 terbuka |

Metrik adopsi dan pendapatan tidak digunakan untuk menilai MVP akademik karena tidak ada transaksi nyata.

## 14. Strategi Pengujian

| Tingkat | Fokus |
|---|---|
| **Unit** | Perhitungan ketersediaan, transisi status, expiry, dan otorisasi |
| **Integration** | Transaksi kuota, webhook replay, penerbitan tiket, check-in atomik |
| **End-to-end** | Organizer → admin → pembeli → payment sandbox → QR → check-in |
| **Security** | RBAC/ownership, brute force, input, signature webhook, kebocoran QR/PII |
| **Performance** | Profil uji pembeli dan scanner |
| **Compatibility** | Browser desktop dan Chrome Android untuk scanner |
| **Usability** | Minimal 5 peserta yang mewakili pembeli, organizer, dan petugas |
| **Recovery** | Restore backup dan penanganan webhook/job yang dijalankan ulang |

Data pengujian harus dapat di-reset dan tidak bergantung pada akun pribadi pengembang.

## 15. Deployment dan Operasional

### 15.1 Lingkungan

1. **Development:** database dan gateway sandbox untuk pengembangan lokal.
2. **Preview/Test:** database terisolasi, callback sandbox publik, seed data, dan UAT.
3. **Production Demo:** konfigurasi terpisah, data uji terkontrol, logging, serta backup.

### 15.2 Release Gate

- Migrasi database diuji pada salinan lingkungan test.
- Build, typecheck, automated test, dan security scan lulus.
- Environment variable wajib tervalidasi saat startup/deploy.
- Health check aplikasi dan koneksi database berhasil.
- Skenario smoke test login, publish event, checkout, webhook, tiket, dan check-in lulus.
- Prosedur rollback aplikasi dan migrasi kompatibel terdokumentasi.

### 15.3 Monitoring Minimum

- Error rate aplikasi dan webhook.
- Jumlah webhook invalid/duplikat.
- Job expiry gagal atau tertunda.
- Latensi p95 check-in.
- Konflik reservasi dan penolakan overselling.
- Health check database dan aplikasi.

## 16. Tim, Anggaran, dan Batas Kapasitas

Baseline rencana mengasumsikan:

| Peran | Tanggung Jawab | Kapasitas Minimum |
|---|---|---|
| **Product owner/peneliti** | Keputusan scope, riset pengguna, UAT, dokumentasi | 1 orang |
| **Full-stack engineer** | UI, API, database, integrasi, deployment | 1 orang penuh selama 12 minggu |
| **Pembimbing/reviewer** | Review metodologi dan milestone | Sesuai jadwal akademik |
| **Peserta uji** | Uji kegunaan pembeli/organizer/petugas | Minimal 5 orang |

**Anggaran baseline:** gunakan free tier/academic tier, gateway sandbox, dan data uji. Biaya domain, email, object storage, atau peningkatan kapasitas harus disetujui terpisah. Jika kapasitas engineer kurang dari asumsi, fitur Should/Could harus dipotong sebelum menurunkan kualitas transaksi Must Have.

## 17. Urutan Implementasi dan Jalur Kritis

Jalur kritis:

`Keputusan gateway & model data → Role/ownership → Event & ticket type → Reservasi/order → Webhook pembayaran → Penerbitan tiket → Check-in atomik → UAT`

| Fase | Minggu | Deliverable | Exit Criteria |
|---|---|---|---|
| Scope dan desain | 1 | Keputusan gateway, data model, wireframe, test plan | Decision gate ditutup |
| Fondasi akses | 2 | Role, ownership, organizer application, migrasi | Uji akses lulus |
| Event dan inventori | 3–4 | Moderasi event, ticket type, katalog | Event dapat Published |
| Order dan reservasi | 5 | Checkout, atomic inventory, expiry job | Uji overselling lulus |
| Payment sandbox | 6–7 | Adapter, checkout provider, webhook idempoten | Skenario webhook lulus |
| Ticket dan check-in | 8–9 | QR, wallet, scanner, atomic check-in | Uji double scan lulus |
| Dashboard dan hardening | 10 | Ringkasan, audit, pembatalan/refund sandbox | Must Have lengkap |
| Verifikasi | 11 | E2E, security, load, usability | Release gate lulus |
| Rilis akademik | 12 | Deployment, laporan hasil, demo | Definition of Done terpenuhi |

Fitur Should/Could dikerjakan hanya jika jalur kritis tidak tertunda.

## 18. Dependensi Pihak Ketiga

| Dependensi | Kebutuhan | Risiko/Fallback |
|---|---|---|
| **Neon/PostgreSQL** | Database dan transaksi | Gunakan lingkungan terpisah dan backup |
| **NextAuth/Google OAuth** | Login | Username/password tetap tersedia |
| **Payment gateway sandbox** | Metode bayar, webhook, refund test | Adapter provider dan simulator webhook untuk test |
| **Object storage** | Gambar event | Placeholder gambar bila belum dipilih |
| **Email provider** | Notifikasi Should Have | In-app notification sebagai fallback |
| **Browser camera API** | Scanner | Input kode manual sebagai Should Have |

## 19. Risiko dan Mitigasi

| Risiko | Dampak | Probabilitas | Mitigasi |
|---|---|---|---|
| Cakupan terlalu besar untuk satu engineer | Tinggi | Tinggi | Kunci Must Have; potong Should/Could |
| Gateway sandbox sulit diakses/dikonfigurasi | Tinggi | Sedang | Pilih pada minggu 1; sediakan adapter dan simulator |
| Overselling akibat race condition | Tinggi | Sedang | Transaksi, constraint, dan concurrent test |
| Webhook terlambat atau duplikat | Tinggi | Tinggi | Idempotensi, event log, rekonsiliasi |
| QR digunakan ulang | Tinggi | Sedang | Token aman dan conditional update atomik |
| Koneksi venue buruk | Sedang | Sedang | Pesan error jelas dan kode manual; offline di luar MVP |
| Data pribadi bocor | Tinggi | Rendah–Sedang | Data uji, minimisasi, RBAC, log redaction |
| Target kinerja tidak sesuai hosting gratis | Sedang | Sedang | Ukur awal; dokumentasikan batas platform |

## 20. Decision Gates dan Pertanyaan Terbuka

### Wajib Diputuskan Sebelum Implementasi Jalur Kritis

1. **Gateway sandbox:** provider, akses akun, metode yang benar-benar tersedia, dan format webhook.
2. **Object storage:** provider atau keputusan menggunakan placeholder selama MVP.
3. **Tanggal kalender dan kapasitas engineer:** konfirmasi apakah baseline 12 minggu realistis.
4. **Pemilik keputusan:** siapa yang menyetujui perubahan scope dan hasil UAT.

### Wajib Diputuskan Sebelum Pilot dengan Pengguna/Data Nyata

1. Merchant of record, alur settlement/payout, fee, pajak, dan rekonsiliasi.
2. Syarat KYC organizer dan verifikasi legalitas event.
3. Kebijakan refund, biaya, SLA, dan tanggung jawab organizer/platform.
4. Pemberitahuan privasi, consent, retensi, penghapusan, serta penanggung jawab data sesuai UU PDP.
5. SLA, kapasitas, RTO/RPO, dukungan pelanggan, dan incident response.
6. Target bisnis: organizer aktif, event Published, conversion, GMV, dan repeat purchase.

## 21. Definition of Done

MVP selesai jika:

1. Seluruh Must Have memiliki bukti acceptance test dan lulus.
2. Jalur organizer, pembeli, admin, dan petugas dapat didemonstrasikan end-to-end.
3. Uji overselling, webhook replay, dan double scan lulus tanpa pelanggaran invarian.
4. Tidak ada defect blocker/critical atau temuan security Critical/High terbuka.
5. Target kinerja diukur pada profil uji dan hasilnya dilaporkan.
6. Uji kegunaan dilaksanakan, task completion dan SUS dihitung.
7. Migrasi, environment, seed/reset data, deployment, monitoring, dan rollback terdokumentasi.
8. Batas sandbox dan larangan penggunaan uang/data nyata terlihat jelas pada demo serta dokumentasi.

## 22. Matriks Ketertelusuran Ringkas

| Tujuan | User Story | Bukti |
|---|---|---|
| Organizer mengelola event | US-02, US-03, US-04, US-10 | E2E organizer dan UAT |
| Pembeli membeli tiket | US-05, US-06, US-07, US-08 | E2E checkout dan webhook |
| Mencegah overselling | US-04, US-06 | Concurrent integration test |
| Mencegah tiket ganda | US-08, US-09 | Concurrent check-in test |
| Admin mengendalikan operasi | US-02, US-03, US-11, US-12 | UAT admin dan audit inspection |
| Membuktikan kegunaan | Seluruh alur utama | Task completion dan SUS |
