# Daftar Fitur MyTicketIn

| Atribut | Nilai |
|---|---|
| **Sumber** | `prd-improved.md` versi 2.2 |
| **Tujuan** | Acuan perencanaan implementasi MVP akademik |
| **Platform** | Web responsif, Bahasa Indonesia, Rupiah |
| **Model pembayaran MVP** | Payment gateway sandbox; tanpa uang nyata |
| **Jumlah fitur** | 77 |
| **Cakupan aktif MVP** | 66 fitur (57 Must, 5 Should, 4 Could) |

## Gambaran Produk

MyTicketIn adalah platform tiket event tatap muka untuk empat persona: **pembeli**, **organizer**, **petugas check-in**, dan **admin**. Alur intinya mencakup pembuatan serta moderasi event, pengaturan inventori dalam tiga mode (`GENERAL_ADMISSION`, `ZONED`, `RESERVED_SEATING`), discovery melalui filter/rekomendasi/pencarian bahasa alami, checkout dengan loyalitas per organizer, pembayaran sandbox, penerbitan e-ticket QR, check-in satu kali, serta bantuan AI poster-ke-draft dengan kendali manusia.

MVP ditujukan untuk validasi akademik selama 12 minggu. Transaksi uang nyata, settlement/payout organizer, dan peluncuran komersial tidak termasuk rilis ini.

## Cara Membaca Dokumen

- **Must Have:** wajib agar MVP dapat didemonstrasikan end-to-end atau aman dioperasikan.
- **Should Have:** penting, tetapi MVP tetap dapat diterima dengan proses pengganti.
- **Could Have:** peningkatan yang dikerjakan hanya jika jalur kritis selesai.
- **Won’t Have:** sengaja dikeluarkan dari rilis ini dan dicatat untuk masa depan.
- **Inti:** bagian dari proposisi nilai utama.
- **Peningkatan:** meningkatkan kegunaan atau efisiensi, tetapi bukan inti transaksi.
- **Mendatang:** di luar cakupan MVP.
- Kompleksitas adalah estimasi relatif, bukan estimasi durasi.

## Daftar Isi

1. [Ringkasan](#ringkasan)
2. [Autentikasi dan Otorisasi](#1-autentikasi-dan-otorisasi)
3. [Organizer dan Pengelolaan Event](#2-organizer-dan-pengelolaan-event)
4. [Katalog dan Inventori Tiket](#3-katalog-dan-inventori-tiket)
5. [Checkout dan Order](#4-checkout-dan-order)
6. [Pembayaran dan Refund Sandbox](#5-pembayaran-dan-refund-sandbox)
7. [E-ticket dan Check-in](#6-e-ticket-dan-check-in)
8. [Dashboard, Administrasi, dan Pelaporan](#7-dashboard-administrasi-dan-pelaporan)
9. [Notifikasi, Analitik, dan Penanganan Error](#8-notifikasi-analitik-dan-penanganan-error)
10. [Platform, Operasional, dan Kualitas](#9-platform-operasional-dan-kualitas)
11. [Fitur Pasca-MVP](#10-fitur-pasca-mvp)
12. [Nilai Tambah Wajib](#11-nilai-tambah-wajib)
13. [Jalur Kritis dan Urutan Implementasi](#jalur-kritis-dan-urutan-implementasi)
14. [Decision Gates](#decision-gates)

## Ringkasan

### Jumlah Berdasarkan Prioritas

| Prioritas | Jumlah | Interpretasi |
|---|---:|---|
| **Must Have** | 57 | Seluruh fitur produk, nilai tambah, keamanan, operasional, dan kursi bernomor wajib |
| **Should Have** | 5 | Peningkatan penting dengan fallback |
| **Could Have** | 4 | Dikerjakan setelah jalur kritis stabil |
| **Won’t Have** | 11 | Di luar rilis akademik saat ini |
| **Total** | **77** | 66 fitur aktif MVP; 11 Won’t Have |

### Jumlah Berdasarkan Kategori

| Kategori | Rentang ID | Jumlah |
|---|---|---:|
| Autentikasi dan Otorisasi | F1–F6 | 6 |
| Organizer dan Pengelolaan Event | F7–F14 | 8 |
| Katalog dan Inventori Tiket | F15–F22, F65 | 9 |
| Checkout dan Order | F23–F28 | 6 |
| Pembayaran dan Refund Sandbox | F29–F33 | 5 |
| E-ticket dan Check-in | F34–F42 | 9 |
| Dashboard, Administrasi, dan Pelaporan | F43–F48 | 6 |
| Notifikasi, Analitik, dan Penanganan Error | F49–F53 | 5 |
| Platform, Operasional, dan Kualitas | F54–F62 | 9 |
| Fitur Pasca-MVP | F63–F64, F66–F73 | 10 |
| Nilai Tambah Wajib | F74–F77 | 4 |
| **Total** | **F1–F77** | **77** |

### Fitur Berisiko atau Membutuhkan Keahlian Khusus

| Fitur | Tantangan |
|---|---|
| **F16, F26–F28, F65** | Transaksi database, konkurensi, overselling kuota, dan hold kursi |
| **F29–F33** | Integrasi payment gateway, signature webhook, idempotensi, dan rekonsiliasi |
| **F35, F37–F40** | Keamanan QR, browser camera API, dan check-in atomik |
| **F59** | Scheduler yang aman dijalankan ulang |
| **F60–F62** | Backup/restore, isolasi lingkungan, deployment, dan rollback |
| **F63–F64** | Keuangan nyata, regulasi, settlement, payout, dan refund produksi |
| **F74** | Privasi riwayat Paid, ranking deterministik, dan pembatasan Published future event |
| **F75** | Ledger append-only, transaksi/reservasi poin, konkurensi, idempotensi, dan reversal refund |
| **F76–F77** | Input AI tidak tepercaya, schema validation, prompt injection, retensi/redaksi, rate limit, fallback, dan provider gate |

## 1. Autentikasi dan Otorisasi

### F1 — Registrasi dengan Username dan Kata Sandi

- **Tipe/persona:** Inti — semua pengguna
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Pengguna membuat akun menggunakan nama, username unik, email unik, dan kata sandi.
- **Kriteria penerimaan:**
  - Input wajib divalidasi pada server dan duplikasi username/email ditolak.
  - Kata sandi disimpan sebagai adaptive hash dan tidak pernah dicatat sebagai teks asli.
  - Registrasi berhasil menghasilkan akun aktif `USER` yang masuk sebagai pembeli.
- **Teknis/kasus khusus:** Terapkan rate limit; tangani request berulang tanpa membuat akun ganda. Pendaftaran publik tidak membuat admin dan tidak membuka portal penyelenggara.
- **Dependensi/keahlian:** PostgreSQL, validasi input, keamanan autentikasi.

### F2 — Login dengan Username dan Kata Sandi

- **Tipe/persona:** Inti — semua pengguna
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Pengguna masuk dengan kredensial lokal.
- **Kriteria penerimaan:**
  - Kredensial valid membuat sesi hanya jika portal yang dipilih cocok dengan jenis akun, lalu mengarahkan ke halaman yang diizinkan.
  - Kredensial salah memberikan pesan generik tanpa membocorkan keberadaan akun.
  - Percobaan berlebihan dibatasi.
- **Teknis/kasus khusus:** Sesi Go (bukan NextAuth). Tiga portal: pembeli, penyelenggara `APPROVED`, admin. Mismatch memakai `AUTH_PORTAL_DENIED` dengan pesan spesifik.
- **Dependensi/keahlian:** NextAuth, bcrypt/adaptive hashing, rate limiting.

### F3 — Login Google

- **Tipe/persona:** Inti — semua pengguna
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Pengguna dapat login melalui Google OAuth.
- **Kriteria penerimaan:**
  - Callback OAuth valid membuat atau menghubungkan akun yang benar.
  - Email yang sudah terkait tidak menghasilkan akun duplikat.
  - Kegagalan/penolakan OAuth mengembalikan pengguna ke halaman login dengan pesan jelas.
- **Teknis/kasus khusus:** Aturan account linking harus mencegah pengambilalihan akun.
- **Dependensi/keahlian:** Google OAuth, NextAuth, konfigurasi redirect URI.

### F4 — Manajemen Sesi dan Logout

- **Tipe/persona:** Inti — semua pengguna
- **Prioritas:** Must Have
- **Kompleksitas:** Rendah
- **Deskripsi:** Sistem menjaga sesi login dan menyediakan logout yang efektif.
- **Kriteria penerimaan:**
  - Halaman terproteksi mengarahkan pengguna tanpa sesi ke login.
  - Logout mengakhiri sesi dan halaman terproteksi tidak dapat dibuka dengan sesi lama.
  - Sesi kedaluwarsa meminta autentikasi ulang.
- **Teknis/kasus khusus:** Cookie `HttpOnly`, `Secure` pada produksi, dan SameSite yang sesuai.
- **Dependensi/keahlian:** NextAuth.

### F5 — RBAC dan Pemeriksaan Kepemilikan

- **Tipe/persona:** Inti — organizer, petugas, admin
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Sistem membatasi tindakan berdasarkan peran/capability dan kepemilikan objek.
- **Kriteria penerimaan:**
  - Pemeriksaan dilakukan pada server untuk setiap aksi terproteksi.
  - Organizer hanya dapat mengelola event dan peserta miliknya.
  - Petugas hanya dapat scan pada event yang ditugaskan; admin memperoleh akses administratif.
- **Teknis/kasus khusus:** Lindungi direct API access dan hindari hanya menyembunyikan tombol pada UI.
- **Dependensi/keahlian:** Model role/permission, security testing.

### F6 — Reset Kata Sandi

- **Tipe/persona:** Peningkatan — pengguna akun lokal
- **Prioritas:** Should Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Pengguna meminta tautan/token terbatas waktu untuk menetapkan kata sandi baru.
- **Kriteria penerimaan:**
  - Respons permintaan tidak mengungkap apakah email terdaftar.
  - Token hanya dapat digunakan sekali dan memiliki waktu kedaluwarsa.
  - Setelah reset, kata sandi lama tidak dapat digunakan.
- **Teknis/kasus khusus:** Jika layanan email belum ada, admin-assisted reset menjadi fallback demo.
- **Dependensi/keahlian:** Email provider, secure token lifecycle.

## 2. Organizer dan Pengelolaan Event

### F7 — Pengajuan Profil Organizer

- **Tipe/persona:** Inti — calon organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Pengguna biasa (sesi pembeli) mengajukan nama organizer, kontak, dan deskripsi.
- **Kriteria penerimaan:**
  - Pengajuan valid berstatus Pending dan terlihat oleh admin.
  - Pengguna dapat melihat status serta alasan penolakan.
  - Pengajuan Pending tidak langsung memberi hak publikasi atau akses portal penyelenggara.
- **Teknis/kasus khusus:** MVP tidak menerima KYC/dokumen identitas nyata. Pengajuan dari dalam aplikasi setelah login pembeli, bukan dari formulir daftar.
- **Dependensi/keahlian:** F1/F2/F3, F5.

### F8 — Moderasi Organizer

- **Tipe/persona:** Inti — admin
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Admin menyetujui, menolak, atau menangguhkan organizer.
- **Kriteria penerimaan:**
  - Keputusan memerlukan alasan dan mengubah status secara valid.
  - Organizer Approved memperoleh capability organizer.
  - Penangguhan mencegah aksi organizer baru tanpa menghapus data historis.
- **Teknis/kasus khusus:** Semua keputusan masuk audit log.
- **Dependensi/keahlian:** F5, F7, F45.

### F9 — CRUD Multi-Event

- **Tipe/persona:** Inti — organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Organizer membuat dan mengelola beberapa draft event.
- **Kriteria penerimaan:**
  - Event menyimpan nama, deskripsi, kategori, venue, alamat, waktu, syarat, kontak, dan gambar/placeholder.
  - Organizer hanya melihat serta mengubah event miliknya.
  - Event dengan order Paid tidak dapat dihapus.
- **Teknis/kasus khusus:** Simpan zona waktu dengan konsisten; validasi waktu event.
- **Dependensi/keahlian:** F5, F7/F8, PostgreSQL.

### F10 — Validasi dan Pengajuan Event

- **Tipe/persona:** Inti — organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Organizer mengajukan event lengkap untuk moderasi.
- **Kriteria penerimaan:**
  - Event hanya dapat diajukan jika field wajib dan minimal satu jenis tiket valid tersedia.
  - Pengajuan mengubah Draft/Rejected menjadi PendingReview.
  - Event PendingReview tidak dapat dibeli.
- **Teknis/kasus khusus:** Kunci field sensitif selama review atau definisikan perubahan yang membatalkan review.
- **Dependensi/keahlian:** F9, F15.

### F11 — Moderasi dan Publikasi Event

- **Tipe/persona:** Inti — admin, organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Admin menyetujui atau menolak event; event Approved menjadi Published.
- **Kriteria penerimaan:**
  - Keputusan memerlukan alasan untuk penolakan.
  - Hanya Published muncul di katalog dan dapat checkout selama periode penjualan.
  - Event Rejected dapat diperbaiki lalu diajukan ulang.
- **Teknis/kasus khusus:** Perubahan status harus tervalidasi server-side dan diaudit.
- **Dependensi/keahlian:** F8–F10, F45.

### F12 — Lifecycle dan Pembatalan Event

- **Tipe/persona:** Inti — organizer, admin, pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Sistem mengelola Draft, PendingReview, Published, Rejected, Cancelled, dan Completed.
- **Kriteria penerimaan:**
  - Event Cancelled berhenti menerima checkout dan tidak kembali Published.
  - Tiket Unused terdampak menjadi Cancelled sesuai proses admin.
  - Data order Paid dan audit historis tidak dihapus.
- **Teknis/kasus khusus:** Used ticket tidak dikembalikan menjadi Unused; koordinasikan order, payment, ticket, dan notifikasi.
- **Dependensi/keahlian:** F11, F31, F33–F40, F45.

### F13 — Pratinjau Event

- **Tipe/persona:** Peningkatan — organizer
- **Prioritas:** Could Have
- **Kompleksitas:** Rendah
- **Deskripsi:** Organizer melihat tampilan event seperti halaman publik sebelum diajukan.
- **Kriteria penerimaan:**
  - Pratinjau menggunakan data draft terbaru.
  - URL pratinjau tidak dapat ditemukan atau dibeli oleh publik.
- **Teknis/kasus khusus:** Jangan mengubah status event saat preview.
- **Dependensi/keahlian:** F9, F21.

### F14 — Penugasan Petugas per Event

- **Tipe/persona:** Peningkatan — organizer, petugas
- **Prioritas:** Should Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Organizer memberi atau mencabut akses scan kepada akun tertentu untuk event tertentu.
- **Kriteria penerimaan:**
  - Petugas hanya melihat scanner event yang ditugaskan.
  - Pencabutan akses berlaku pada request berikutnya.
  - Perubahan assignment tercatat.
- **Teknis/kasus khusus:** Organizer tetap dapat scan event miliknya tanpa assignment tambahan.
- **Dependensi/keahlian:** F5, F37, F45.

## 3. Katalog dan Inventori Tiket

### F15 — Konfigurasi Jenis Tiket

- **Tipe/persona:** Inti — organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Organizer menambah beberapa jenis tiket dengan nama, harga, kuota, periode penjualan, dan limit, sesuai mode inventori event.
- **Kriteria penerimaan:**
  - Event memilih tepat satu mode: `GENERAL_ADMISSION`, `ZONED`, atau `RESERVED_SEATING`.
  - Harga adalah Rupiah ≥ 0 dan kuota bilangan bulat positif.
  - Jadwal penjualan valid dan berakhir sebelum/ketika event dimulai.
  - Penurunan kuota tidak boleh di bawah jumlah Paid plus reservasi aktif.
  - Pada `ZONED` dan `RESERVED_SEATING`, jenis tiket merepresentasikan kategori/area berharga; kursi bernomor dikelompokkan ke kategori tersebut.
  - Mode inventori tidak dapat diubah setelah order, reservasi, atau tiket Paid ada.
- **Teknis/kasus khusus:** Perubahan harga tidak mengubah snapshot item pada order lama. Request yang tidak sesuai mode ditolak dengan `INVENTORY_MODE_MISMATCH`.
- **Dependensi/keahlian:** F9, F65, data validation.

### F16 — Perhitungan Ketersediaan Atomik

- **Tipe/persona:** Inti — organizer, pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Ketersediaan dihitung dari kuota dikurangi tiket Paid dan reservasi aktif, atau dari status hold/Paid per kursi pada mode `RESERVED_SEATING`.
- **Kriteria penerimaan:**
  - Nilai ketersediaan tidak negatif.
  - Checkout bersamaan tidak dapat melampaui kuota.
  - Dua pembeli yang memilih kursi yang sama hanya menghasilkan satu hold aktif.
  - Dashboard dan detail event memakai sumber perhitungan yang konsisten.
- **Teknis/kasus khusus:** Gunakan transaksi, conditional update/locking, constraint, dan concurrent test termasuk kursi yang sama.
- **Dependensi/keahlian:** PostgreSQL concurrency, F15, F26/F27, F65.

### F17 — Hentikan Penjualan per Jenis Tiket

- **Tipe/persona:** Peningkatan — organizer
- **Prioritas:** Could Have
- **Kompleksitas:** Rendah
- **Deskripsi:** Organizer menonaktifkan penjualan satu jenis tiket tanpa membatalkan event.
- **Kriteria penerimaan:**
  - Jenis tiket berhenti tersedia untuk checkout baru.
  - Order dan tiket yang sudah ada tidak berubah.
- **Teknis/kasus khusus:** Status sale harus diperiksa ulang saat checkout.
- **Dependensi/keahlian:** F15, F23.

### F18 — Katalog Event Publik

- **Tipe/persona:** Inti — pengunjung/pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Pengunjung melihat daftar event tanpa login.
- **Kriteria penerimaan:**
  - Hanya event Published ditampilkan.
  - Item menampilkan informasi ringkas dan tautan ke detail.
  - Event Cancelled/Completed tidak ditawarkan sebagai event yang dapat dibeli.
- **Teknis/kasus khusus:** Gunakan pagination atau limit terukur.
- **Dependensi/keahlian:** F11, database indexing.

### F19 — Pencarian Kata Kunci

- **Tipe/persona:** Inti — pengunjung/pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Pengunjung mencari event minimal berdasarkan nama.
- **Kriteria penerimaan:**
  - Pencarian tidak peka kapital dan hanya mengembalikan Published.
  - Query kosong kembali ke katalog.
  - Tidak ada hasil menampilkan empty state yang jelas.
- **Teknis/kasus khusus:** Sanitasi input dan indeks sesuai kebutuhan.
- **Dependensi/keahlian:** F18, PostgreSQL search/index.

### F20 — Filter Kategori, Lokasi, dan Tanggal

- **Tipe/persona:** Peningkatan — pengunjung/pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Katalog dapat disaring berdasarkan kategori, lokasi, dan tanggal.
- **Kriteria penerimaan:**
  - Filter dapat digabung dan dihapus.
  - Hasil serta URL/query state konsisten.
- **Teknis/kasus khusus:** Definisikan normalisasi lokasi dan batas tanggal.
- **Dependensi/keahlian:** F18/F19.

### F21 — Halaman Detail Event

- **Tipe/persona:** Inti — pengunjung/pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Halaman menampilkan organizer, deskripsi, jadwal, venue, syarat, tiket/kategori, harga, ketersediaan, serta denah statis dan selector kursi bila mode `RESERVED_SEATING`.
- **Kriteria penerimaan:**
  - Data sesuai event Published terbaru.
  - Tombol checkout dinonaktifkan jika event/tiket tidak dapat dijual.
  - Status sold out, belum mulai, atau penjualan berakhir terlihat jelas.
  - Denah adalah gambar statis dengan alt text/legenda; pemilihan kursi memakai list/grid aksesibel terpisah, bukan peta klik.
- **Teknis/kasus khusus:** Ketersediaan final tetap divalidasi saat checkout.
- **Dependensi/keahlian:** F15/F16, F18, F65.

### F22 — Gambar Event dan Object Storage

- **Tipe/persona:** Peningkatan — organizer, pembeli
- **Prioritas:** Should Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Organizer mengunggah gambar event yang disimpan di object storage.
- **Kriteria penerimaan:**
  - Hanya tipe/ukuran file yang diizinkan dapat diunggah.
  - Gambar tampil di katalog/detail; placeholder digunakan jika tidak ada.
  - File tidak disimpan pada filesystem runtime.
- **Teknis/kasus khusus:** Validasi MIME, ukuran, akses publik/URL, dan penghapusan file yatim. Denah venue memakai kontrak upload yang sama dengan gambar event.
- **Dependensi/keahlian:** Provider object storage pihak ketiga.

F65 (kursi bernomor dan denah venue statis) adalah Must Have inventori; spesifikasi lengkap tetap memakai ID F65 pada bagian 10 agar urutan ID tidak pecah.

## 4. Checkout dan Order

### F23 — Pemilihan Jenis dan Jumlah Tiket

- **Tipe/persona:** Inti — pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Pembeli memilih jenis dan jumlah tiket, atau kursi bernomor, untuk satu event sesuai mode inventori.
- **Kriteria penerimaan:**
  - Maksimal 5 tiket per jenis per akun per event.
  - Jumlah harus positif dan tidak melebihi ketersediaan saat request diproses.
  - Item dari event berbeda tidak dapat digabung.
  - Pada `RESERVED_SEATING`, pembeli memilih kursi spesifik melalui list/grid aksesibel; denah hanya menjelaskan layout.
  - Pemilihan yang tidak sesuai mode ditolak dengan `INVENTORY_MODE_MISMATCH`; kursi yang sudah di-hold atau Paid ditolak dengan `SEAT_UNAVAILABLE`.
- **Teknis/kasus khusus:** Jangan mempercayai harga/jumlah/kursi dari client.
- **Dependensi/keahlian:** F15/F16, F21, F65.

### F24 — Ringkasan Checkout

- **Tipe/persona:** Inti — pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Rendah
- **Deskripsi:** Pembeli meninjau item, jumlah, kategori/label kursi, harga, total, dan batas waktu sebelum pembayaran.
- **Kriteria penerimaan:**
  - Total dihitung ulang pada server.
  - Pembeli memberikan konfirmasi sebelum order/payment dibuat.
  - Perubahan harga/ketersediaan/kursi menghasilkan pesan dan refresh ringkasan.
- **Teknis/kasus khusus:** MVP tidak memiliki fee layanan.
- **Dependensi/keahlian:** F23.

### F25 — Pembuatan dan Status Order

- **Tipe/persona:** Inti — pembeli, admin
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Sistem membuat nomor order unik dan mengelola Pending, Paid, Failed, Expired, Cancelled, Refunded.
- **Kriteria penerimaan:**
  - Order menyimpan snapshot item/harga/kategori/kursi dan pemilik.
  - Transisi status yang tidak valid ditolak.
  - Pengguna hanya melihat order miliknya; admin dapat menelusuri seluruh order.
- **Teknis/kasus khusus:** Pisahkan status Order dan Payment.
- **Dependensi/keahlian:** F5, PostgreSQL.

### F26 — Reservasi Inventori 15 Menit

- **Tipe/persona:** Inti — pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Order Pending menahan kuota atau kursi spesifik selama 15 menit.
- **Kriteria penerimaan:**
  - Reservasi dan order dibuat dalam satu transaksi.
  - Reservasi aktif mengurangi ketersediaan; hold kursi aktif menandai kursi tidak tersedia.
  - Setelah expiry, order menjadi Expired dan kuota/hold kursi dilepas tepat satu kali.
- **Teknis/kasus khusus:** Reservasi adalah record terpisah, bukan Ticket. Satu kursi paling banyak satu hold aktif.
- **Dependensi/keahlian:** F16, F25, F59, database transaction.

### F27 — Pencegahan Overselling

- **Tipe/persona:** Inti — organizer, pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Sistem menjaga invarian kuota pada checkout bersamaan.
- **Kriteria penerimaan:**
  - Pada sisa satu tiket, hanya satu checkout bersamaan berhasil reservasi.
  - Tidak ada keadaan `Paid + reservasi aktif > kuota`.
  - Request gagal tidak meninggalkan reservasi parsial.
- **Teknis/kasus khusus:** Wajib concurrent integration test.
- **Dependensi/keahlian:** F16, F26, PostgreSQL locking/atomic update.

### F28 — Idempotensi Checkout

- **Tipe/persona:** Inti — pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Retry request checkout tidak membuat order/reservasi ganda.
- **Kriteria penerimaan:**
  - Idempotency key yang sama dan payload sama mengembalikan hasil order yang sama.
  - Key sama dengan payload berbeda ditolak.
  - Gangguan jaringan dan klik ganda tidak menduplikasi order.
- **Teknis/kasus khusus:** Tetapkan scope dan masa berlaku key.
- **Dependensi/keahlian:** F25/F26, idempotency design.

## 5. Pembayaran dan Refund Sandbox

### F29 — Integrasi Payment Gateway Sandbox

- **Tipe/persona:** Inti — pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Sistem membuat transaksi sandbox melalui satu adapter provider.
- **Kriteria penerimaan:**
  - Nominal provider sama dengan total order.
  - QRIS, virtual account, dan e-wallet tersedia jika didukung akun sandbox terpilih.
  - Kredensial provider tidak terekspos ke client/log.
- **Teknis/kasus khusus:** Provider harus dipilih pada decision gate; gunakan adapter untuk mengisolasi domain.
- **Dependensi/keahlian:** Payment gateway pihak ketiga, API integration, secrets.

### F30 — Instruksi dan Status Pembayaran

- **Tipe/persona:** Inti — pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Pembeli melihat metode, instruksi, batas waktu, dan status pembayaran.
- **Kriteria penerimaan:**
  - Halaman menampilkan Pending/Paid/Failed/Expired secara konsisten.
  - Refresh tidak membuat transaksi provider baru.
  - Order non-Paid tidak menampilkan tiket.
- **Teknis/kasus khusus:** Status internal bersumber dari webhook tepercaya, bukan query client saja.
- **Dependensi/keahlian:** F25, F29/F31.

### F31 — Verifikasi dan Idempotensi Webhook

- **Tipe/persona:** Inti — sistem, admin
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Sistem memverifikasi signature dan memproses event pembayaran tepat satu kali secara efektif.
- **Kriteria penerimaan:**
  - Signature invalid ditolak tanpa mengubah Order/Payment.
  - Event provider yang sama dapat direplay tanpa tiket/status ganda.
  - Sukses tepercaya mengubah Order pertama kali menjadi Paid dan memicu penerbitan tiket.
- **Teknis/kasus khusus:** Simpan external event ID unik dan payload hash; redaksi PII/rahasia.
- **Dependensi/keahlian:** F25, F29, webhook security.

### F32 — Rekonsiliasi Pembayaran Terlambat

- **Tipe/persona:** Inti — admin
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Callback sukses yang datang setelah order Expired ditahan untuk pemeriksaan.
- **Kriteria penerimaan:**
  - Sistem tidak menerbitkan tiket otomatis jika reservasi sudah dilepas.
  - Kasus terlihat pada antrean/status admin dengan referensi provider.
  - Keputusan penyelesaian dicatat pada audit log.
- **Teknis/kasus khusus:** Hindari menghidupkan reservasi lama yang kuotanya mungkin sudah terjual.
- **Dependensi/keahlian:** F26, F31, F44/F45.

### F33 — Lifecycle Refund Sandbox

- **Tipe/persona:** Peningkatan — admin, pembeli
- **Prioritas:** Should Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Admin mencatat Requested, Approved, Rejected, Processing, Completed, atau Failed untuk refund sandbox.
- **Kriteria penerimaan:**
  - Catatan memuat nominal, alasan, admin, waktu, dan referensi provider bila ada.
  - Tiket Unused yang direfund menjadi Cancelled.
  - Tidak ada uang nyata yang dipindahkan pada MVP.
- **Teknis/kasus khusus:** Refund tiket Used ditolak dari alur biasa.
- **Dependensi/keahlian:** Gateway refund sandbox, F12, F31, F45.

## 6. E-ticket dan Check-in

### F34 — Penerbitan Tiket per Unit

- **Tipe/persona:** Inti — pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Setiap unit pada order Paid menghasilkan tepat satu Ticket.
- **Kriteria penerimaan:**
  - Order Pending/Failed/Expired tidak menghasilkan tiket.
  - Replay webhook tidak menambah tiket.
  - Jumlah Ticket sama dengan jumlah unit pada order Paid.
  - Ticket kursi menyimpan snapshot kategori, label kursi, dan harga yang sama dengan order item.
- **Teknis/kasus khusus:** Penerbitan terjadi dalam transaksi terkait perubahan pertama ke Paid dan mengonversi hold kursi menjadi assignment Paid.
- **Dependensi/keahlian:** F25, F31, F65, database transaction.

### F35 — QR Tiket Aman

- **Tipe/persona:** Inti — pembeli, petugas
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Setiap tiket memiliki QR unik yang tidak mudah ditebak dan tidak mengekspos PII.
- **Kriteria penerimaan:**
  - Token memiliki entropy minimal 128-bit atau payload ditandatangani.
  - Dua tiket tidak berbagi token.
  - QR hanya berfungsi sebagai pengenal; keputusan validasi dilakukan server.
- **Teknis/kasus khusus:** Simpan hash token bila memungkinkan; sediakan strategi rotasi kunci.
- **Dependensi/keahlian:** Cryptographic token design, QR library.

### F36 — Dompet/Daftar Tiket Pembeli

- **Tipe/persona:** Inti — pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Pembeli melihat tiket Unused, Used, atau Cancelled pada perangkat mobile.
- **Kriteria penerimaan:**
  - Hanya pemilik tiket dapat membuka detail/QR.
  - Detail menampilkan event, jenis/kategori tiket, label kursi bila ada, identitas pemilik order, dan status.
  - Status berubah setelah check-in atau pembatalan.
- **Teknis/kasus khusus:** Cegah cache publik pada halaman QR.
- **Dependensi/keahlian:** F5, F34/F35.

### F37 — Scanner QR Online

- **Tipe/persona:** Inti — organizer, petugas
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Browser menggunakan kamera untuk membaca QR dan mengirim token ke server.
- **Kriteria penerimaan:**
  - Hanya pengguna berwenang dapat membuka scanner event.
  - QR yang terbaca dikirim satu kali per debounce interval.
  - Kegagalan izin kamera/koneksi menampilkan langkah pemulihan.
- **Teknis/kasus khusus:** Uji khusus Chrome Android dan permission camera.
- **Dependensi/keahlian:** Browser Camera API, QR scanning library, F5/F35.

### F38 — Hasil Validasi yang Tegas

- **Tipe/persona:** Inti — petugas
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Scanner menampilkan Valid, Already Used, Invalid, Cancelled, atau Wrong Event.
- **Kriteria penerimaan:**
  - Hasil memiliki label dan alasan yang mudah dibedakan.
  - Already Used menampilkan waktu penggunaan pertama tanpa PII berlebih.
  - Valid menampilkan kategori/label kursi yang konsisten dengan tiket dan denah.
  - Gangguan server tidak ditampilkan sebagai tiket Invalid.
- **Teknis/kasus khusus:** Gunakan reason code stabil untuk UI dan analitik.
- **Dependensi/keahlian:** F37, F39/F40.

### F39 — Check-in Atomik Satu Kali

- **Tipe/persona:** Inti — petugas, organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Ticket Unused berubah menjadi Used tepat satu kali.
- **Kriteria penerimaan:**
  - Dua scan bersamaan hanya menghasilkan satu keberhasilan.
  - Ticket Used/Cancelled atau order non-Paid tidak dapat diterima.
  - Scan untuk event berbeda ditolak.
  - Hasil Valid menampilkan kategori dan label kursi yang sama dengan snapshot tiket.
- **Teknis/kasus khusus:** Conditional update `Unused → Used` dalam transaksi.
- **Dependensi/keahlian:** PostgreSQL concurrency, F35/F37, F65.

### F40 — Log Percobaan Check-in

- **Tipe/persona:** Inti — admin, organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Setiap scan menyimpan event, petugas, waktu, hasil, ticket jika dikenali, serta label kategori/kursi dari snapshot tiket.
- **Kriteria penerimaan:**
  - Scan berhasil maupun gagal tercatat.
  - Organizer hanya melihat log event miliknya.
  - Log tidak menyimpan token QR mentah.
  - Label kursi/kategori pada log sesuai snapshot tiket, bukan denah yang dapat berubah.
- **Teknis/kasus khusus:** Tetapkan retensi sebelum pilot data nyata.
- **Dependensi/keahlian:** F38/F39, F45.

### F41 — Input Kode Tiket Manual

- **Tipe/persona:** Peningkatan — petugas
- **Prioritas:** Should Have
- **Kompleksitas:** Rendah
- **Deskripsi:** Petugas memasukkan kode ketika kamera gagal.
- **Kriteria penerimaan:**
  - Kode menjalankan aturan validasi yang sama dengan scan.
  - Input invalid/rate berlebih dibatasi.
- **Teknis/kasus khusus:** Jangan tampilkan token penuh pada halaman pembeli jika kode pendek dapat ditebak.
- **Dependensi/keahlian:** F38/F39, rate limiting.

### F42 — Scanner Offline

- **Tipe/persona:** Mendatang — petugas
- **Prioritas:** Won’t Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Check-in tanpa koneksi dan sinkronisasi konflik setelah online.
- **Kriteria penerimaan rilis ini:** Tidak ada mode offline; kehilangan koneksi tidak menandai tiket Used secara lokal.
- **Teknis/kasus khusus:** Versi masa depan memerlukan data terenkripsi, strategi konflik, revocation, dan anti-double-scan lintas perangkat.
- **Dependensi/keahlian:** Offline-first architecture, security, conflict resolution.

## 7. Dashboard, Administrasi, dan Pelaporan

### F43 — Dashboard Organizer

- **Tipe/persona:** Inti — organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Organizer melihat order Paid, tiket terjual, pendapatan sandbox bruto, dan check-in per event.
- **Kriteria penerimaan:**
  - Data dibatasi pada event milik organizer.
  - Angka konsisten dengan sumber Order/Ticket/CheckIn.
  - Empty state tersedia untuk event tanpa transaksi.
- **Teknis/kasus khusus:** Pendapatan berlabel sandbox dan bukan nilai settlement.
- **Dependensi/keahlian:** F5, F25, F34, F39.

### F44 — Dashboard Operasional Admin

- **Tipe/persona:** Inti — admin
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Admin melihat antrean moderasi, order/payment bermasalah, pembatalan, dan refund sandbox.
- **Kriteria penerimaan:**
  - Admin dapat membuka detail yang diperlukan untuk mengambil keputusan.
  - Kasus callback terlambat dan status mismatch terlihat.
  - Aksi mutasi selalu meminta alasan dan diaudit.
- **Teknis/kasus khusus:** Terapkan pagination dan minimisasi PII.
- **Dependensi/keahlian:** F5, F8/F11/F12, F32/F33, F45.

### F45 — Audit Log

- **Tipe/persona:** Inti — admin/sistem
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Sistem mencatat aktor, aksi, entitas, waktu, dan perubahan status sensitif.
- **Kriteria penerimaan:**
  - Moderasi, pembatalan, refund, webhook, assignment, dan check-in tercatat.
  - Audit log tidak dapat diubah melalui UI aplikasi.
  - Before/after disaring agar tidak berisi rahasia atau token.
- **Teknis/kasus khusus:** Definisikan retensi dan kontrol akses sebelum pilot.
- **Dependensi/keahlian:** Cross-cutting backend design, security.

### F46 — Ekspor CSV

- **Tipe/persona:** Peningkatan — organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Organizer mengekspor peserta dan check-in milik event.
- **Kriteria penerimaan:**
  - File hanya memuat event milik organizer dan kolom yang disetujui.
  - Filter yang aktif tercermin dalam hasil ekspor.
  - Untuk event `RESERVED_SEATING` atau `ZONED`, ekspor menyertakan kategori/area dan label kursi.
- **Teknis/kasus khusus:** Lindungi dari CSV injection dan minimalkan PII.
- **Dependensi/keahlian:** F5, F40/F43.

### F47 — Grafik Penjualan

- **Tipe/persona:** Peningkatan — organizer
- **Prioritas:** Could Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Dashboard menampilkan tren order Paid/tiket terjual.
- **Kriteria penerimaan:**
  - Rentang waktu dan zona waktu ditampilkan.
  - Total grafik konsisten dengan ringkasan.
- **Teknis/kasus khusus:** Jangan memblokir dashboard jika data grafik gagal.
- **Dependensi/keahlian:** F43, chart library.

### F48 — Pencarian Admin Lintas Entitas

- **Tipe/persona:** Peningkatan — admin
- **Prioritas:** Could Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Admin mencari user, organizer, event, order, payment, dan ticket dari satu area.
- **Kriteria penerimaan:**
  - Hasil dikelompokkan berdasarkan entitas.
  - Query tidak mengekspos data di luar hak admin.
- **Teknis/kasus khusus:** Pagination, indeks, dan audit akses data sensitif.
- **Dependensi/keahlian:** F44, database search.

## 8. Notifikasi, Analitik, dan Penanganan Error

### F49 — Notifikasi In-App

- **Tipe/persona:** Inti — pembeli, organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Sistem memberi notifikasi perubahan penting di dalam aplikasi.
- **Kriteria penerimaan:**
  - Minimal mencakup hasil moderasi, pembayaran/tiket, pembatalan, dan refund.
  - Pengguna hanya menerima notifikasi miliknya dan dapat menandai sebagai dibaca.
- **Teknis/kasus khusus:** Pembuatan notifikasi tidak boleh menggagalkan transaksi utama; gunakan retry/outbox jika perlu.
- **Dependensi/keahlian:** F11/F12, F31/F33/F34.

### F50 — Notifikasi Email

- **Tipe/persona:** Peningkatan — pembeli, organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Email dikirim untuk konfirmasi pembayaran, tiket, hasil moderasi, dan pembatalan.
- **Kriteria penerimaan:**
  - Kegagalan email tidak membatalkan pembayaran/tiket.
  - Email tidak memuat token QR sensitif pada log.
  - Pengiriman memiliki status dan retry terbatas.
- **Teknis/kasus khusus:** In-app menjadi fallback.
- **Dependensi/keahlian:** Email provider pihak ketiga, template, deliverability.

### F51 — Reminder Event

- **Tipe/persona:** Peningkatan — pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Pembeli menerima pengingat sebelum event.
- **Kriteria penerimaan:**
  - Hanya pemilik tiket Unused pada event aktif menerima reminder.
  - Event Cancelled tidak mengirim reminder.
- **Teknis/kasus khusus:** Reminder dikirim satu kali pada T-24 jam menggunakan waktu database dan zona waktu event; retry wajib idempoten.
- **Dependensi/keahlian:** F49/F50, scheduler.

### F52 — Event Analitik Produk

- **Tipe/persona:** Inti — product owner/peneliti
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Sistem merekam funnel organizer, event, checkout, pembayaran, tiket, dan check-in.
- **Kriteria penerimaan:**
  - Event minimum dari PRD terkirim dengan timestamp dan identifier non-sensitif.
  - Reason code tersedia untuk payment/check-in failure.
  - Password, token QR, dan PII tidak perlu tidak dikirim.
- **Teknis/kasus khusus:** Definisikan event schema/version agar metrik konsisten.
- **Dependensi/keahlian:** Analytics/logging provider atau structured event store.

### F53 — Pesan Error dan Recovery State

- **Tipe/persona:** Inti — semua pengguna
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Sistem membedakan error validasi, akses, kuota, pembayaran, kamera, dan jaringan.
- **Kriteria penerimaan:**
  - Pesan Bahasa Indonesia menjelaskan masalah dan langkah pemulihan.
  - Error jaringan tidak disamakan dengan tiket/payment invalid.
  - Detail internal, stack trace, dan rahasia tidak tampil ke pengguna.
- **Teknis/kasus khusus:** Gunakan error code stabil dan correlation ID.
- **Dependensi/keahlian:** Seluruh alur utama, observability.

## 9. Platform, Operasional, dan Kualitas

### F54 — Web Responsif

- **Tipe/persona:** Inti — semua pengguna
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Alur utama berfungsi pada ponsel, tablet, dan desktop.
- **Kriteria penerimaan:**
  - Tidak ada overflow yang menghalangi aksi utama.
  - Katalog, checkout, ticket wallet, dan scanner dapat digunakan pada viewport mobile.
- **Teknis/kasus khusus:** Prioritaskan mobile untuk ticket wallet/scanner.
- **Dependensi/keahlian:** Responsive UI.

### F55 — Lokalisasi Bahasa Indonesia dan Rupiah

- **Tipe/persona:** Inti — semua pengguna
- **Prioritas:** Must Have
- **Kompleksitas:** Rendah
- **Deskripsi:** UI, tanggal, angka, dan harga mengikuti konteks Indonesia.
- **Kriteria penerimaan:**
  - Harga ditampilkan sebagai Rupiah tanpa salah pembulatan.
  - Pesan utama menggunakan Bahasa Indonesia konsisten.
  - Waktu ditampilkan sesuai zona waktu event.
- **Teknis/kasus khusus:** Simpan nominal sebagai integer unit Rupiah dan waktu secara konsisten.
- **Dependensi/keahlian:** Internationalization/date handling.

### F56 — Kompatibilitas Browser dan Kamera

- **Tipe/persona:** Inti — semua pengguna/petugas
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Mendukung dua versi terbaru Chrome, Edge, Firefox, Safari, serta scanner pada Chrome Android.
- **Kriteria penerimaan:**
  - Smoke test alur utama lulus pada browser target.
  - Permission dan scanning kamera lulus pada Chrome Android.
- **Teknis/kasus khusus:** Safari/iOS dapat memiliki batas camera API; dokumentasikan perbedaan.
- **Dependensi/keahlian:** Device/browser testing.

### F57 — Aksesibilitas Alur Utama

- **Tipe/persona:** Inti — semua pengguna
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Alur utama menargetkan WCAG 2.1 AA.
- **Kriteria penerimaan:**
  - Navigasi keyboard, focus state, label, kontras, dan error form diperiksa.
  - Status scanner tidak hanya dibedakan dengan warna.
- **Teknis/kasus khusus:** Kamera membutuhkan alternatif/instruksi yang dapat diakses.
- **Dependensi/keahlian:** Accessibility testing.

### F58 — Structured Logging, Health Check, dan Monitoring

- **Tipe/persona:** Inti — tim teknis/admin
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Sistem memantau error, webhook, expiry job, latensi scan, konflik kuota, aplikasi, dan database.
- **Kriteria penerimaan:**
  - Health check memberi status aplikasi/database tanpa membocorkan rahasia.
  - Log memiliki correlation ID dan menyensor PII/token.
  - Kegagalan webhook/job dapat ditemukan dari log/metrik.
- **Teknis/kasus khusus:** Tentukan retention dan akses log.
- **Dependensi/keahlian:** Observability provider, structured logging.

### F59 — Scheduler Kedaluwarsa Order

- **Tipe/persona:** Inti — sistem
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Job berkala menandai order Pending lewat 15 menit sebagai Expired dan melepas reservasi.
- **Kriteria penerimaan:**
  - Job aman dijalankan ulang dan oleh lebih dari satu worker.
  - Order yang sudah Paid tidak di-expire.
  - Kegagalan job tercatat dan dapat dicoba ulang.
- **Teknis/kasus khusus:** Gunakan waktu server/database; hindari race dengan webhook sukses.
- **Dependensi/keahlian:** Scheduler/cron pihak ketiga, F26/F31.

### F60 — Backup dan Restore Database

- **Tipe/persona:** Inti — tim teknis
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Data memiliki backup dan prosedur pemulihan yang diuji.
- **Kriteria penerimaan:**
  - RPO baseline 24 jam terdokumentasi.
  - Restore drill berhasil sebelum rilis akademik.
- **Teknis/kasus khusus:** Pilot komersial memerlukan RTO/RPO dan retention baru.
- **Dependensi/keahlian:** Neon backup/restore, database operations.

### F61 — Isolasi Lingkungan

- **Tipe/persona:** Inti — tim teknis
- **Prioritas:** Must Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Development, Preview/Test, dan Production Demo menggunakan konfigurasi serta data terpisah.
- **Kriteria penerimaan:**
  - Kredensial dan database tidak dipakai silang tanpa sengaja.
  - Test memiliki seed/reset data.
  - Callback sandbox dapat diuji pada Preview/Test.
- **Teknis/kasus khusus:** Environment variable wajib divalidasi saat startup/deploy.
- **Dependensi/keahlian:** Hosting, Neon branches/databases, secrets management.

### F62 — Release Pipeline, Migrasi, dan Rollback

- **Tipe/persona:** Inti — tim teknis
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Rilis melewati build, typecheck, test, security scan, migrasi, smoke test, dan prosedur rollback.
- **Kriteria penerimaan:**
  - Migrasi diuji pada lingkungan test sebelum demo.
  - Release diblokir jika gate wajib gagal.
  - Rollback aplikasi dan strategi migrasi kompatibel terdokumentasi.
- **Teknis/kasus khusus:** Hindari destructive migration satu langkah pada data penting.
- **Dependensi/keahlian:** CI/CD, database migration, hosting.

## 10. Fitur Pasca-MVP

F63–F64 dan F66–F73 dicatat agar tidak “masuk diam-diam” ke rilis akademik. **F65 adalah Must Have MVP** (kursi bernomor dan denah venue statis) dan tetap memakai ID ini agar urutan F1–F77 tidak pecah. Clickable map, editor drag-and-drop, orphan-seat optimization, dan collaborative map editing tetap non-goal.

### F63 — Transaksi Uang Nyata, Settlement, dan Payout

- **Tipe/persona:** Mendatang — platform, organizer
- **Prioritas:** Won’t Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Menerima pembayaran nyata dan menyalurkan dana kepada organizer.
- **Kriteria penerimaan rilis ini:** Semua transaksi menggunakan sandbox dan UI diberi label uji.
- **Teknis/kasus khusus:** Versi produksi memerlukan merchant-of-record, KYC, fee, pajak, ledger, rekonsiliasi, dan dispute handling.
- **Dependensi/keahlian:** Payment/legal/finance specialist.

### F64 — Refund Finansial Produksi

- **Tipe/persona:** Mendatang — admin, pembeli
- **Prioritas:** Won’t Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Mengembalikan uang nyata sesuai kebijakan dan SLA.
- **Kriteria penerimaan rilis ini:** Hanya status/refund sandbox yang boleh diproses.
- **Teknis/kasus khusus:** Memerlukan kebijakan fee, partial refund, payout reversal, dan rekonsiliasi.
- **Dependensi/keahlian:** Gateway produksi, legal/finance operations.

### F65 — Kursi Bernomor dan Denah Venue

- **Tipe/persona:** Inti — pembeli, organizer, petugas
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Event `RESERVED_SEATING` mengelompokkan kursi bernomor per kategori/area dan harga. Organizer mengunggah denah venue statis beserta legenda/teks alternatif; pembeli memilih kursi melalui list/grid aksesibel yang terpisah. Checkout menahan kursi 15 menit; Paid mengonversi hold menjadi tiket dengan snapshot kursi.
- **Kriteria penerimaan:**
  - Setiap event memilih tepat satu mode; `RESERVED_SEATING` mewajibkan section, kursi, denah statis, dan alt text/legenda.
  - Dua pembeli yang memilih kursi yang sama hanya menghasilkan satu hold aktif atau satu tiket Paid.
  - Hold kedaluwarsa, Failed, Expired, atau Cancelled melepaskan kursi tepat satu kali.
  - Denah adalah gambar penjelasan, bukan peta klik atau editor drag-and-drop.
  - Label kategori/kursi konsisten pada authoring, checkout, tiket, scanner, dan CSV.
  - Clickable map, orphan-seat optimization, dan collaborative map editing berada di luar rilis ini.
- **Teknis/kasus khusus:** Model `VenueSection`, `SeatMapAsset`, dan `EventSeat`; error `SEAT_UNAVAILABLE` dan `INVENTORY_MODE_MISMATCH`; mode immutable setelah commerce. Diselesaikan oleh RFC-008 dengan fondasi authoring di RFC-005.
- **Dependensi/keahlian:** F15/F16, F21–F26, F34–F36, F39/F40, F46; PostgreSQL concurrency, object storage, WCAG 2.1 AA.

### F66 — Voucher, Promo, dan Referral

- **Tipe/persona:** Mendatang — pembeli, organizer
- **Prioritas:** Won’t Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Diskon dan atribusi referral.
- **Kriteria penerimaan rilis ini:** Checkout tidak menerima kode promo.
- **Teknis/kasus khusus:** Versi masa depan memerlukan stacking rule, limit, eligibility, dan abuse prevention.
- **Dependensi/keahlian:** Pricing rules.

### F67 — Waiting List

- **Tipe/persona:** Mendatang — pembeli, organizer
- **Prioritas:** Won’t Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Antrean pembeli ketika tiket habis.
- **Kriteria penerimaan rilis ini:** Sold out hanya menampilkan status tidak tersedia.
- **Teknis/kasus khusus:** Memerlukan offer expiry dan fairness rule.
- **Dependensi/keahlian:** Scheduler, notification.

### F68 — Dynamic Pricing

- **Tipe/persona:** Mendatang — organizer
- **Prioritas:** Won’t Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Harga berubah otomatis berdasarkan aturan atau permintaan.
- **Kriteria penerimaan rilis ini:** Harga hanya berubah melalui edit organizer dan order menyimpan snapshot.
- **Teknis/kasus khusus:** Memerlukan transparansi harga, rule engine, dan audit.
- **Dependensi/keahlian:** Pricing engine, analytics.

### F69 — Transfer dan Resale Tiket

- **Tipe/persona:** Mendatang — pembeli
- **Prioritas:** Won’t Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Pemilik memindahkan atau menjual kembali tiket secara aman.
- **Kriteria penerimaan rilis ini:** Kepemilikan tiket tidak dapat dipindahkan.
- **Teknis/kasus khusus:** Memerlukan revocation QR lama, identity rule, fraud control, dan kebijakan harga.
- **Dependensi/keahlian:** Security, payment, marketplace policy.

### F70 — Event Online/Hybrid

- **Tipe/persona:** Mendatang — organizer, pembeli
- **Prioritas:** Won’t Have
- **Kompleksitas:** Sedang
- **Deskripsi:** Tiket memberi akses ke event virtual atau gabungan.
- **Kriteria penerimaan rilis ini:** Hanya event tatap muka dengan venue yang diterima.
- **Teknis/kasus khusus:** Memerlukan akses konten, link protection, dan aturan attendance baru.
- **Dependensi/keahlian:** Streaming/meeting integration.

### F71 — Aplikasi Mobile Native

- **Tipe/persona:** Mendatang — semua pengguna
- **Prioritas:** Won’t Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Aplikasi iOS/Android native.
- **Kriteria penerimaan rilis ini:** Produk hanya tersedia sebagai web responsif.
- **Teknis/kasus khusus:** Memerlukan mobile stack, store release, push notification, dan API contract stabil.
- **Dependensi/keahlian:** Mobile engineering.

### F72 — Multi-Bahasa dan Multi-Mata Uang

- **Tipe/persona:** Mendatang — semua pengguna
- **Prioritas:** Won’t Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Dukungan locale dan mata uang di luar Indonesia/Rupiah.
- **Kriteria penerimaan rilis ini:** Bahasa Indonesia dan Rupiah menjadi satu-satunya pilihan.
- **Teknis/kasus khusus:** Memerlukan FX, rounding, timezone, pajak, dan content translation.
- **Dependensi/keahlian:** Internationalization, finance.

### F73 — Monetisasi Platform

- **Tipe/persona:** Mendatang — bisnis/platform
- **Prioritas:** Won’t Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Biaya layanan per transaksi atau langganan organizer.
- **Kriteria penerimaan rilis ini:** Total checkout tidak memuat fee platform dan tidak ada paket berbayar.
- **Teknis/kasus khusus:** Memerlukan pricing strategy, invoice/tax, entitlement, refund allocation, dan eksperimen pasar.
- **Dependensi/keahlian:** Product strategy, billing, legal/finance.

## 11. Nilai Tambah Wajib

Keempat fitur berikut adalah Must Have aktif MVP akademik. Implementasinya tetap provider-neutral, menggunakan data uji dan sandbox, serta tidak mengubah F42, F63–F64, dan F66–F73 yang tetap Won’t Have. F65 adalah Must Have inventori kursi bernomor dan bukan bagian Won’t Have.

### F74 — Rekomendasi Event Serupa

- **Tipe/persona:** Nilai tambah wajib — pengunjung/pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Sistem menampilkan event serupa berdasarkan kategori, lokasi, organizer, konteks event/filter saat ini, serta riwayat Order Paid milik pembeli jika tersedia.
- **Kriteria penerimaan:**
  - Kandidat selalu dibatasi pada event Published dengan waktu event di masa depan.
  - Untuk pembeli dengan riwayat, sinyal personal hanya berasal dari Order Paid milik pembeli tersebut; order Pending/Failed/Expired dan riwayat pengguna lain tidak digunakan.
  - Tanpa riwayat Paid atau tanpa sesi, sistem memberi fallback kontekstual berdasarkan kategori, lokasi, organizer, dan event yang sedang dilihat.
  - Event saat ini, Cancelled, Completed, draft, atau event yang waktunya telah lewat tidak ditampilkan.
  - Ranking memiliki tie-breaker stabil, dapat diuji secara deterministik, dan empty state tidak menghalangi detail/katalog.
- **Teknis/kasus khusus:** PostgreSQL adalah sumber kandidat dan status; minimalkan data profil, hindari kebocoran riwayat lintas akun, gunakan pagination/limit, dan jangan menganggap output AI sebagai kebutuhan fitur ini.
- **Dependensi/keahlian:** F5, F11, F18–F21, F25/F31; query/index PostgreSQL, authorization, privacy testing.

### F75 — Poin Loyalitas per Organizer

- **Tipe/persona:** Nilai tambah wajib — pembeli, organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Sangat tinggi
- **Deskripsi:** Pembeli memperoleh dan menukarkan poin yang sepenuhnya terisolasi untuk setiap organizer dalam alur pembayaran sandbox.
- **Aturan baseline:**
  - Saldo terisolasi per pasangan pembeli–organizer; poin tidak dapat ditransfer, digabung lintas organizer, diuangkan, atau dipakai sebagai alat pembayaran di luar MyTicketIn.
  - Earn adalah **1 poin per Rp1.000 net paid**; redeem bernilai **1 poin = Rp10** dan dibatasi maksimum **20% dari total order**.
  - Poin, Rupiah, saldo, dan batas dihitung sebagai integer dengan aturan pembulatan turun yang eksplisit; poin tidak kedaluwarsa.
  - Ledger bersifat append-only. Koreksi selalu berupa entri kompensasi dengan reference/idempotency key unik; histori tidak diubah atau dihapus.
- **Kriteria penerimaan:**
  - Checkout memvalidasi organizer seluruh item, saldo tersedia, nilai redeem, dan batas 20% pada server.
  - Pembuatan order dan reservasi poin terjadi atomik; dua checkout bersamaan tidak dapat mereservasi saldo yang sama melebihi saldo tersedia.
  - Order Pending yang menjadi Failed, Expired, atau Cancelled melepaskan reservasi tepat satu kali.
  - Transisi pertama Order ke Paid mengonversi reservasi menjadi debit ledger dan memberikan poin earned dari net paid tepat satu kali, termasuk saat webhook direplay.
  - Refund Completed membalik poin earned sesuai nominal net paid yang direfund melalui entri reversal; full refund Completed memulihkan seluruh poin yang diredeem melalui entri restore.
  - Refund Requested/Processing/Failed belum mengubah ledger final; retry dan callback out-of-order tidak menggandakan debit, earn, reversal, atau restore.
  - Saldo dan histori hanya terlihat oleh pembeli terkait serta admin yang berwenang; organizer hanya melihat agregat yang diizinkan, bukan saldo lintas pembeli tanpa kebutuhan.
- **Teknis/kasus khusus:** Gunakan transaksi PostgreSQL, locking/conditional update, constraint non-negatif, unique idempotency reference, serta rekonsiliasi saldo dari ledger. Label seluruh nilai sebagai program sandbox tanpa nilai tunai.
- **Dependensi/keahlian:** F5, F23–F33, F45, F52, F59; domain accounting, PostgreSQL concurrency, refund/idempotency testing.

### F76 — Pemindaian Poster Event Berbantuan AI

- **Tipe/persona:** Nilai tambah wajib — organizer
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** Organizer mengunggah poster untuk memperoleh saran terstruktur bagi field draft event, lalu meninjau dan memilih saran sebelum menyimpan.
- **Kriteria penerimaan:**
  - Sistem menerima hanya tipe/ukuran gambar yang diizinkan, menerapkan rate limit, dan memperlakukan gambar, OCR, teks, serta metadata sebagai input tidak tepercaya.
  - Output AI harus sesuai schema/allowlist field draft, misalnya nama, deskripsi, kategori, venue, alamat, waktu, syarat, dan kontak; nilai invalid ditolak atau ditandai.
  - UI memperlihatkan saran dan perbedaan terhadap draft saat ini; organizer memilih field yang diterapkan dan menekan simpan secara eksplisit.
  - Pemrosesan tidak pernah membuat event secara diam-diam, auto-submit ke moderasi, auto-approve, atau auto-publish.
  - Saran tidak dapat melewati ownership, status event, validasi tanggal, moderasi, atau aturan F9–F12.
  - Timeout, output malformed, atau provider failure menampilkan recovery yang jelas dan tidak merusak draft yang telah ada.
  - Retensi gambar/output, redaksi PII/log, penghapusan artefak, limit penggunaan, dan provider/model ditutup melalui decision gate sebelum integrasi.
- **Teknis/kasus khusus:** Gunakan port provider-neutral dan structured output validation; jangan memasukkan instruksi dari poster ke system/tool context, jangan log prompt/gambar/output mentah, dan sediakan deterministic fake untuk test. Tidak ada SDK provider yang dipilih pada baseline.
- **Dependensi/keahlian:** F5, F9/F10, F22 bila penyimpanan persisten diperlukan, F45, F53, F58, F61/F62; secure upload, AI safety, privacy.

### F77 — Pencarian Event dengan Bahasa Alami Berbantuan AI

- **Tipe/persona:** Nilai tambah wajib — pengunjung/pembeli
- **Prioritas:** Must Have
- **Kompleksitas:** Tinggi
- **Deskripsi:** AI menerjemahkan permintaan pencarian bahasa alami menjadi intent dan filter katalog tervalidasi; aplikasi lalu mengambil hasil dari PostgreSQL.
- **Kriteria penerimaan:**
  - Model hanya boleh menghasilkan struktur filter dari allowlist, seperti kata kunci, kategori, lokasi, rentang tanggal, dan organizer; model tidak menghasilkan atau menjalankan SQL.
  - Boundary memvalidasi panjang input, schema output, enum, tanggal, dan operator sebelum filter digunakan.
  - Query dibangun oleh repository/application code berparameter dan selalu membatasi hasil ke event Published; event tidak pernah dibuat/dihasilkan oleh model.
  - Filter hasil parsing terlihat, dapat dihapus/diubah, dan tersinkron ke URL.
  - Timeout, rate limit, output invalid, atau provider failure otomatis memakai F19/F20 sebagai fallback pencarian standar tanpa memblokir katalog.
  - Query dan output tidak dicatat utuh bila mengandung PII; telemetry hanya menyimpan metadata aman dan reason code fallback.
- **Teknis/kasus khusus:** Gunakan port provider-neutral, timeout/circuit breaker terukur, structured output validation, dan deterministic fake. AI tidak menjadi source of truth katalog dan tidak memiliki akses langsung database.
- **Dependensi/keahlian:** F18–F20, F53, F58, F61/F62; Zod/schema validation, PostgreSQL search, AI security.

## Jalur Kritis dan Urutan Implementasi

### Jalur Kritis

`Decision gate provider → F5 RBAC → F7–F12 Organizer/Event + F76 AI Draft → F15–F21 Discovery + F65 + F77 → F23–F28 Order/Reservasi/Hold kursi + F75 → F29–F32 Payment/Webhook/Ledger → F34–F40 Ticket/Check-in → F46/F74/F49–F51 → UAT`

Fitur platform **F58–F62** harus dibangun bersama jalur kritis, bukan ditunda ke akhir. Seluruh **57 Must Have** wajib selesai dalam baseline 12 minggu; risiko jadwal tinggi harus dimitigasi melalui pemotongan Should/Could atau perubahan kapasitas yang disetujui, bukan dengan menurunkan Must secara diam-diam.

### Urutan yang Disarankan

| Tahap | Fitur Utama | Exit Criteria |
|---|---|---|
| 1. Fondasi | F1–F8, F45, F61 | Login, role, ownership, dan moderasi organizer aman |
| 2. Event dan katalog | F9–F21, F65, F76–F77 | Event dapat diajukan, ditemukan, dan dicari; AI tetap menghasilkan saran draft/filter; denah/kursi dapat diauthor |
| 3. Order dan inventori | F23–F28, F59, F65, F75 | Concurrent checkout tidak oversell/over-redeem; expiry melepas kuota, hold kursi, dan poin |
| 4. Payment sandbox | F29–F32, F75 | Webhook dan konversi/reversal ledger idempoten lulus |
| 5. Ticket dan check-in | F34–F40 | Penerbitan tepat satu tiket per unit dan double-scan ditolak |
| 6. Operasional wajib | F43–F46, F49–F62, F74 | Dashboard, rekomendasi berbasis histori Paid, ekspor, notifikasi/email/reminder, audit, observability, dan release gate siap |
| 7. Should Have | F6, F14, F22, F33, F41 | Dikerjakan jika jalur kritis stabil |
| 8. Could Have | F13, F17, F47, F48 | Dikerjakan hanya jika waktu tersisa |

## Peta Dependensi Utama

| Fitur | Bergantung Pada | Memblokir |
|---|---|---|
| F5 RBAC | F1–F4 | Seluruh fitur organizer/admin/petugas |
| F11 Publikasi | F7–F10, F15 | F18–F21, checkout |
| F16 Inventori | F15, F65 | F23–F28 |
| F26 Reservasi | F16, F25, F59, F65 | F29–F32 |
| F31 Webhook | F25, F29 | F34–F36 |
| F34 Penerbitan tiket | F31, F35, F65 | F36–F40 |
| F39 Check-in atomik | F34–F38 | F40, metrik check-in |
| F45 Audit | Model aktor/entitas | Moderasi, refund, investigasi |
| F58 Observability | Error/event schema | Release gate |
| F61/F62 Deployment | Hosting, database, secrets | UAT dan rilis |
| F65 Kursi bernomor | F15/F16, F21–F26, F34–F36 | Checkout, tiket, scanner, CSV |
| F74 Rekomendasi | F5, F11, F18–F21, F25/F31 | Discovery personal/kontekstual |
| F75 Loyalitas | F5, F23–F33, F45, F59 | Checkout, payment, refund, rekonsiliasi |
| F76 AI poster | F5, F9/F10, F53/F58, provider gate | Draft event terstruktur |
| F77 AI search | F18–F20, F53/F58, provider gate | Discovery bahasa alami |

## Decision Gates

### Sebelum Memulai Integrasi Kritis

1. **Payment gateway sandbox:** pilih provider, verifikasi akses akun, metode pembayaran, signature, dan format webhook.
2. **Object storage:** pilih provider atau gunakan placeholder sehingga F22 tidak memblokir jalur kritis.
3. **Scheduler:** tentukan mekanisme cron/job yang tersedia pada hosting untuk F59.
4. **Hosting dan lingkungan:** tetapkan deployment Preview/Test dan Production Demo.
5. **AI provider-neutral:** setujui kebutuhan model/provider, structured output, lokasi pemrosesan, kebijakan retensi/penghapusan, redaksi PII, rate limit/quota, biaya, timeout, dan observability untuk F76/F77. Jangan memilih SDK provider sebelum gate ditutup.
6. **Email provider:** setujui provider, sender/domain sandbox, quota, retry, dan batas deliverability untuk F50/F51.
7. **Pemilik keputusan:** tetapkan pihak yang menyetujui perubahan MoSCoW dan UAT.

### Sebelum Pilot dengan Uang atau Data Nyata

- Merchant of record, settlement, payout, fee, pajak, dan rekonsiliasi.
- KYC/legalitas organizer dan event.
- Kebijakan refund, dispute, serta dukungan pelanggan.
- Pemberitahuan privasi, dasar pemrosesan, retensi, dan penghapusan sesuai UU PDP.
- SLA, RTO/RPO, kapasitas, incident response, dan target bisnis.

Decision gate pilot tidak memblokir MVP akademik selama sistem tetap memakai sandbox serta data uji.
