# Product Requirements Document — MyTicketIn

| Atribut | Nilai |
|---|---|
| **Versi** | 2.2 |
| **Status** | Baseline implementasi MVP akademik |
| **Platform** | Web responsif |
| **Pasar sasaran** | Indonesia, event tatap muka |
| **Horizon rilis** | 12 minggu, tanggal kalender TBD |
| **Model MVP** | Validasi alur dengan payment gateway sandbox; tanpa uang nyata |
| **Pemilik keputusan** | Product Owner/peneliti — nama TBD |

> **Batas penting:** MVP ini menguji alur produk menggunakan transaksi sandbox. Penerimaan uang nyata, settlement/payout organizer, refund finansial nyata, dan peluncuran komersial memerlukan keputusan legal, operasional, dan payment gateway terpisah.

## 1. Ringkasan Eksekutif

MyTicketIn adalah platform web untuk membuat, menemukan, membeli, dan memvalidasi tiket event tatap muka. Organizer dapat mengelola beberapa event dan inventori tiket dalam salah satu dari tiga mode: general admission, zona/kategori, atau kursi bernomor; pembeli dapat menemukan event melalui filter, rekomendasi, dan pencarian bahasa alami, memilih tiket atau kursi sesuai mode event, melakukan pembayaran sandbox dengan loyalitas per organizer, menerima e-ticket QR, serta melihat riwayat tiket; admin memoderasi organizer/event serta mengawasi transaksi; petugas melakukan check-in satu kali. Organizer juga memperoleh bantuan AI untuk mengekstrak saran draft event dari poster, dengan review manusia sebelum data disimpan.

**Hipotesis produk:** jika penjualan, status pembayaran, inventori, dan check-in dikelola dalam satu sistem, organizer dapat mengurangi pekerjaan rekap dan risiko tiket ganda, sementara pembeli memperoleh pengalaman yang lebih jelas dan tepercaya.

## 2. Visi, Masalah, dan Nilai

### 2.1 Visi

Menjadi fondasi pengelolaan tiket event Indonesia yang sederhana dan tepercaya, dari publikasi event hingga peserta masuk venue.

### 2.2 Pernyataan Masalah

Organizer yang menggunakan formulir, pesan pribadi, dan transfer manual harus merekonsiliasi pesanan, pembayaran, kuota, dan kehadiran secara terpisah. Akibatnya, data mudah tidak sinkron, kuota sulit dikontrol, dan tiket dapat digunakan ulang. Pembeli juga kesulitan mengetahui status pembayaran dan menemukan kembali tiketnya.

### 2.3 Nilai per Pengguna

| Pengguna | Kebutuhan | Nilai MyTicketIn |
|---|---|---|
| **Pembeli** | Menemukan event dan memperoleh tiket yang valid tanpa ketidakjelasan status | Katalog terpusat, pemilihan tiket/kursi sesuai mode, checkout, status pembayaran, dan tiket QR |
| **Organizer** | Menjual tiket tanpa rekap manual dan memantau kehadiran | Inventori atomik per mode, denah statis, dashboard, serta check-in terintegrasi |
| **Petugas** | Memvalidasi peserta dengan cepat dan pasti | Scanner dengan hasil Valid/Used/Invalid yang tegas |
| **Admin** | Mengendalikan kualitas dan menelusuri insiden | Moderasi, pencarian data operasional, serta audit log |

## 3. Tujuan dan Non-Tujuan

### 3.1 Tujuan MVP

1. Membuktikan alur organizer dari pembuatan event sampai pemantauan check-in.
2. Membuktikan alur pembeli dari pencarian sampai memperoleh tiket setelah pembayaran sandbox.
3. Menjamin kuota dan kursi bernomor tidak terjual melebihi batas pada profil beban uji.
4. Menjamin satu tiket hanya dapat berhasil di-check-in satu kali.
5. Mengukur kegunaan produk melalui tugas pengguna dan System Usability Scale (SUS).
6. Membuktikan delapan fitur nilai tambah wajib—filter event; notifikasi dan reminder; ekspor CSV; rekomendasi; loyalitas; pemindaian poster berbantuan AI; pencarian bahasa alami berbantuan AI; serta kursi bernomor dengan denah venue statis—tanpa melemahkan integritas transaksi inti.

### 3.2 Non-Tujuan MVP

- Mengoperasikan marketplace tiket komersial atau menerima uang nyata.
- Menyediakan settlement/payout organizer dan rekonsiliasi finansial produksi.
- Menangani editor denah interaktif, clickable map, orphan-seat optimization, resale, transfer tiket, voucher, atau dynamic pricing.
- Mendukung event online/hybrid, multi-negara, multi-mata uang, atau aplikasi mobile native.
- Menyediakan scanner offline atau integrasi perangkat turnstile.
- Menyatakan kepatuhan produksi hanya berdasarkan pengujian akademik.

## 4. Persona dan Jobs to Be Done

### 4.1 Pembeli — “Raka”

- **Konteks:** mencari event melalui ponsel dan terbiasa dengan QRIS/e-wallet.
- **Tujuan:** membeli tiket atau kursi yang tersedia dan membukanya kembali saat hari acara.
- **JTBD:** “Ketika menemukan event yang ingin saya hadiri, saya ingin mengetahui harga, kategori, dan ketersediaannya—termasuk kursi bernomor bila event memakai denah—menyelesaikan pembayaran, lalu memperoleh tiket yang statusnya jelas.”

### 4.2 Organizer — “Nadia”

- **Konteks:** mengelola beberapa event dengan kelas, zona, atau kursi bernomor yang harganya berbeda.
- **Tujuan:** menerbitkan event, memantau penjualan per kategori/kursi, dan mengetahui jumlah peserta hadir.
- **JTBD:** “Ketika menjual tiket, saya ingin kuota, kursi, dan pembayaran diperbarui otomatis agar tidak perlu merekap manual atau menerima pesanan berlebih.”

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
| **Tipe event** | Tatap muka; setiap event memilih tepat satu mode: `GENERAL_ADMISSION`, `ZONED`, atau `RESERVED_SEATING` |
| **Denah kursi MVP** | Organizer mengunggah gambar denah statis dan legenda/teks alternatif; pembeli memilih melalui list/grid aksesibel terpisah. Clickable map, editor drag-and-drop, orphan-seat optimization, dan collaborative map editing bukan bagian MVP |
| **Pembayaran** | Satu payment gateway sandbox; QRIS, virtual account, dan e-wallet jika tersedia dalam akun sandbox |
| **Reservasi kuota** | 15 menit sejak order dibuat; setelah itu order Expired dan kuota/hold kursi dilepas |
| **Batas pembelian** | Maksimal 5 tiket per jenis tiket per akun per event |
| **Tiket** | Satu unit tiket menghasilkan satu QR unik setelah order Paid; tiket kursi menyimpan snapshot label/kategori/harga |
| **Check-in** | Online; hanya organizer pemilik event atau petugas yang diberi akses |
| **Pembatalan/refund** | Admin mencatat siklus refund sandbox; tidak ada pengembalian uang nyata |
| **Notifikasi** | In-app dan email transaksional wajib; reminder event wajib |
| **Bahasa/mata uang** | Bahasa Indonesia dan Rupiah |
| **Data pengujian** | Gunakan akun dan transaksi uji; hindari dokumen identitas nyata |
| **Rekomendasi** | Hanya event Published yang akan datang; gunakan kategori, lokasi, organizer, dan riwayat Paid milik pembeli; fallback kontekstual tersedia tanpa riwayat |
| **Loyalitas** | Poin terisolasi per pasangan pembeli–organizer; 1 poin per Rp1.000 net paid, nilai redeem 1 poin = Rp10, maksimum 20% order, tanpa kedaluwarsa dan tanpa nilai tunai |
| **AI poster** | Hanya menghasilkan saran terstruktur; organizer wajib meninjau, menerapkan, dan menyimpan; AI tidak boleh auto-submit atau auto-publish |
| **AI search** | AI hanya mengubah bahasa alami menjadi filter tervalidasi; PostgreSQL tetap memilih event Published; fallback ke pencarian standar bila AI gagal |
| **Provider AI** | Provider-neutral dan baru dipilih melalui decision gate; tidak ada SDK provider yang dipilih pada baseline |

## 6. Ruang Lingkup dengan MoSCoW

### 6.1 Must Have

- Baseline terdiri dari **57 Must Have**; bersama 5 Should Have dan 4 Could Have, cakupan aktif MVP adalah **66 dari total 77 fitur**. F42, F63–F64, dan F66–F73 tetap Won’t Have; F65 adalah Must Have.
- Registrasi/login, logout, sesi, dan otorisasi server-side.
- Pengajuan dan persetujuan profil organizer.
- CRUD draft event, moderasi, publikasi, dan pembatalan.
- Beberapa jenis tiket per event dengan harga, kuota, periode penjualan, serta tepat satu mode inventori: `GENERAL_ADMISSION`, `ZONED`, atau `RESERVED_SEATING`.
- Authoring kategori/area, kursi bernomor, serta unggahan denah venue statis beserta legenda/teks alternatif.
- Katalog, pencarian kata kunci, detail event, denah statis, serta filter kategori, lokasi, dan tanggal.
- Rekomendasi event serupa yang aman dan kontekstual.
- Pencarian event bahasa alami dengan parsing AI ke filter tervalidasi dan fallback pencarian standar.
- AI poster scan yang hanya memberi saran draft terstruktur dengan human review.
- Checkout satu event, reservasi kuota atau hold kursi 15 menit, order, dan pembayaran sandbox.
- Poin loyalitas per organizer dengan reservasi dan ledger atomik.
- Webhook pembayaran yang terverifikasi dan idempoten.
- Penerbitan e-ticket QR setelah status Paid.
- Daftar tiket pembeli.
- Scanner online dan check-in atomik satu kali.
- Dashboard minimum organizer dan admin.
- Ekspor peserta/check-in CSV yang aman.
- Notifikasi in-app, email transaksional, dan reminder event.
- Audit log untuk moderasi, perubahan status pembayaran, pembatalan, refund, dan check-in.
- Penanganan error utama: stok habis, kursi tidak tersedia, mode inventori tidak cocok, order kedaluwarsa, webhook ganda, QR salah event, QR used, serta akses tanpa izin.

### 6.2 Should Have

- Petugas check-in terpisah yang dapat diberi/dicabut akses per event.
- Input kode tiket manual saat kamera gagal.
- Gambar event melalui object storage.
- Pencatatan refund sandbox dengan status lengkap.
- Reset kata sandi.

### 6.3 Could Have

- Pratinjau event sebelum diajukan.
- Grafik penjualan sederhana.
- Pencarian admin lintas entitas.
- Penghentian penjualan per jenis tiket.

### 6.4 Won’t Have pada Rilis Ini

- Transaksi uang nyata, payout, atau refund finansial nyata.
- Editor denah interaktif, clickable map, orphan-seat optimization, kode promo, waiting list, resale, dan transfer tiket.
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

- **Given** organizer Approved, **when** data wajib, mode inventori, dan minimal satu jenis tiket valid disimpan, **then** event dapat diajukan.
- **Given** event Pending Review, **when** admin menyetujui, **then** status menjadi Published dan event tampil di katalog.
- **Given** event Rejected, **when** organizer membuka event, **then** alasan terlihat dan event dapat diperbaiki lalu diajukan ulang.
- Event yang sudah memiliki order Paid tidak boleh dihapus; hanya dapat dibatalkan.

### US-04 — Inventori Tiket

**Sebagai organizer, saya ingin menentukan mode inventori, harga, kuota, kategori/kursi, dan periode penjualan agar penjualan mengikuti kapasitas event.**

**MoSCoW:** Must Have

- Setiap event memilih tepat satu mode: `GENERAL_ADMISSION`, `ZONED`, atau `RESERVED_SEATING`.
- Harga berupa bilangan Rupiah ≥ 0 dan kuota berupa bilangan bulat positif.
- Waktu mulai penjualan harus lebih awal daripada waktu selesai dan waktu event.
- Ketersediaan kategori dihitung sebagai `kuota - paid - reservasi_aktif`.
- Untuk `RESERVED_SEATING`, ketersediaan kursi adalah kursi tanpa hold aktif dan tanpa tiket Paid.
- Perubahan harga tidak mengubah item order yang telah dibuat.
- Penurunan kuota tidak boleh lebih kecil dari jumlah Paid dan reservasi aktif.
- Mode inventori tidak boleh diubah setelah commerce dimulai.
- Organizer mengunggah gambar denah statis beserta legenda/teks alternatif untuk `RESERVED_SEATING`; denah bukan peta klik.

### US-05 — Penemuan Event

**Sebagai pengunjung, saya ingin mencari dan membaca detail event agar dapat memutuskan tiket yang akan dibeli.**

**MoSCoW:** Must Have

- Hanya event Published yang muncul di katalog.
- Pencarian kata kunci mencocokkan minimal nama event.
- Detail menampilkan organizer, deskripsi, waktu, lokasi, syarat, jenis/kategori tiket, harga, periode penjualan, status ketersediaan, serta denah statis dan selector kursi jika mode `RESERVED_SEATING`.
- Event Cancelled atau Completed tidak dapat memulai checkout.

### US-06 — Checkout dan Reservasi

**Sebagai pembeli, saya ingin memilih tiket atau kursi dan memperoleh waktu pembayaran agar kuota atau kursi tidak direbut saat saya membayar.**

**MoSCoW:** Must Have

- **Given** kuota atau kursi tersedia, **when** checkout dibuat, **then** sistem membuat order Pending dan reservasi/hold selama 15 menit.
- **Given** sisa kuota tidak cukup atau kursi sudah di-hold/Paid, **when** checkout diproses, **then** sistem menolak tanpa membuat reservasi parsial.
- **Given** dua pembeli memilih kursi yang sama, **when** keduanya checkout, **then** hanya satu hold aktif yang berhasil.
- **Given** order melewati 15 menit tanpa Paid, **when** proses kedaluwarsa berjalan, **then** status menjadi Expired dan kuota/hold kursi dilepas.
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
- Tiket menampilkan event, jenis/kategori tiket, label kursi bila ada, pemilik order, dan status Unused/Used/Cancelled.
- Order Pending, Failed, atau Expired tidak menghasilkan tiket.

### US-09 — Check-in

**Sebagai petugas, saya ingin memindai QR agar hanya tiket yang sah dapat digunakan.**

**MoSCoW:** Must Have

- QR Unused untuk event dan petugas yang benar menghasilkan Valid lalu berubah atomik menjadi Used; hasil menampilkan kategori/label kursi yang konsisten dengan tiket.
- Dua pemindaian bersamaan terhadap tiket yang sama hanya menghasilkan satu keberhasilan.
- QR Used menghasilkan Already Used beserta waktu penggunaan pertama.
- QR event lain, tidak dikenal, Cancelled, atau terkait order tidak Paid ditolak dengan alasan yang sesuai.
- Setiap percobaan menyimpan event, tiket bila dikenali, petugas, waktu, dan hasil.

### US-10 — Dashboard Organizer

**Sebagai organizer, saya ingin melihat performa tiap event agar dapat memantau operasi.**

**MoSCoW:** Must Have

- Organizer hanya dapat melihat event miliknya.
- Ringkasan menampilkan order Paid, tiket terjual, pendapatan sandbox bruto, check-in, serta penjualan per kategori/kursi sesuai mode event.
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

### US-13 — Rekomendasi Event Serupa

**Sebagai pembeli, saya ingin melihat event serupa agar lebih mudah menemukan event relevan.**

**MoSCoW:** Must Have

- Kandidat hanya event Published dengan waktu event di masa depan.
- Ranking menggunakan kategori, lokasi, organizer, dan—bila pengguna login—riwayat Order Paid milik pembeli tersebut.
- Riwayat pembeli lain, order non-Paid, dan data lintas akun tidak boleh memengaruhi profil personal pembeli.
- Tanpa riwayat Paid, sistem memberikan fallback kontekstual dari event/detail/filter yang sedang dilihat.

### US-14 — Poin Loyalitas per Organizer

**Sebagai pembeli, saya ingin memperoleh dan memakai poin organizer secara aman pada order berikutnya.**

**MoSCoW:** Must Have

- Saldo dipisahkan per pasangan pembeli–organizer; poin tidak dapat dipindahkan, diuangkan, atau dipakai pada organizer lain.
- Pembeli memperoleh 1 poin per Rp1.000 net paid dan dapat redeem 1 poin senilai Rp10, maksimum 20% total order; seluruh perhitungan memakai integer dan poin tidak kedaluwarsa.
- Checkout mereservasi poin secara atomik; order Pending yang Failed, Expired, atau Cancelled melepaskan reservasi.
- Transisi pertama ke Paid mengubah reservasi menjadi debit ledger dan memberikan poin earned tepat satu kali.
- Refund Completed membalik poin earned; full refund Completed memulihkan poin yang diredeem. Ledger bersifat append-only dengan entri kompensasi.

### US-15 — Pemindaian Poster Event Berbantuan AI

**Sebagai organizer, saya ingin memperoleh saran draft dari poster agar input event lebih cepat tanpa kehilangan kendali.**

**MoSCoW:** Must Have

- Gambar/teks poster diperlakukan sebagai input tidak tepercaya dan hanya menghasilkan saran terstruktur untuk field yang diizinkan.
- Organizer melihat perbedaan, memilih saran yang diterapkan, lalu menyimpan draft secara eksplisit.
- Sistem tidak pernah membuat submission moderasi atau mem-Published event secara otomatis.
- Upload dan pemrosesan menerapkan validasi file, rate limit, timeout, redaksi PII/log, serta kebijakan retensi; kegagalan provider tidak merusak draft yang ada.

### US-16 — Pencarian Event dengan Bahasa Alami Berbantuan AI

**Sebagai pengunjung, saya ingin mencari event dengan bahasa alami agar kebutuhan saya diterjemahkan ke filter yang tepat.**

**MoSCoW:** Must Have

- AI hanya menghasilkan intent/filter dari schema dan allowlist yang tervalidasi, bukan SQL atau event.
- PostgreSQL menjalankan query aplikasi dan hanya mengembalikan event Published.
- Query/filter hasil parsing terlihat dan dapat diubah pengguna.
- Timeout, output invalid, atau kegagalan provider beralih ke pencarian kata kunci/filter standar dengan pesan yang jelas.

## 8. Alur Utama dan Alur Kegagalan

### 8.1 Jalur Organizer

`Daftar/Login → Ajukan organizer → Persetujuan admin → Buat event atau scan poster menjadi saran draft → Review/apply/save → Pilih mode inventori → Tambah jenis tiket/kategori/kursi dan denah statis → Ajukan event → Persetujuan admin → Published → Pantau penjualan/check-in`

Alur kegagalan:

- Pengajuan ditolak → alasan tampil → organizer memperbaiki dan mengajukan ulang.
- AI poster gagal/output invalid → draft lama tetap aman dan organizer melanjutkan input manual.
- Event sudah memiliki order Paid → penghapusan ditolak → gunakan pembatalan.
- Periode penjualan tidak valid → event tidak dapat diajukan.

### 8.2 Jalur Pembeli

`Katalog/filter/rekomendasi/AI search → Detail event → Pilih tiket atau kursi sesuai mode → Login → Pilih poin organizer → Reservasi inventori+poin 15 menit → Pembayaran sandbox → Webhook Paid → Ledger+poin earned → Tiket QR`

Alur kegagalan:

- Kuota habis atau kursi tidak tersedia saat checkout → order tidak dibuat dan pengguna diminta memilih ulang.
- Pembayaran gagal → order Failed dan kuota dilepas.
- Waktu habis → order Expired dan pembeli harus checkout ulang.
- Pembayaran gagal/expired/cancelled → reservasi poin, kuota, dan hold kursi dilepas tepat satu kali.
- Callback terlambat setelah Expired → admin merekonsiliasi; tiket tidak diterbitkan otomatis.
- AI search gagal → gunakan pencarian kata kunci/filter standar; jangan menghasilkan query SQL dari model.

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
| **LoyaltyPointReservation** | Active, Released, Consumed |

Reservasi inventori adalah entitas/record terpisah yang terkait dengan Order, bukan status Ticket. Ticket baru dibuat setelah Order Paid.

### 9.2 Invarian

1. `paid_quantity + active_reservation_quantity ≤ ticket_type.quota`.
2. Satu referensi payment provider hanya boleh terkait dengan satu Payment.
3. Satu unit item order Paid menghasilkan tepat satu Ticket.
4. Satu Ticket hanya memiliki paling banyak satu check-in berhasil.
5. Organizer tidak dapat membaca data peserta event milik organizer lain.
6. Event Cancelled tidak dapat kembali menjadi Published.
7. Status berubah hanya melalui transisi yang diizinkan dan tercatat.
8. Saldo poin terisolasi per pasangan pembeli–organizer dan tidak dapat dipindahkan, diuangkan, atau digunakan lintas organizer.
9. Poin dihitung dengan integer: 1 poin per Rp1.000 net paid; redeem bernilai Rp10 per poin dan tidak boleh melebihi 20% total order.
10. Reservasi poin dan order dibuat atomik; order Pending yang Failed, Expired, atau Cancelled melepaskan reservasi tepat satu kali.
11. Transisi pertama ke Paid mengubah reservasi menjadi debit ledger tepat satu kali dan memberikan poin earned tepat satu kali.
12. Refund Completed membalik poin earned secara proporsional; full refund Completed memulihkan seluruh poin yang diredeem, tanpa mengubah/menghapus entri ledger lama.
13. Hanya event Published dengan waktu event di masa depan dapat direkomendasikan atau dikembalikan oleh pencarian AI.
14. Output AI tidak pernah menjadi SQL, event, submission, atau publication; seluruh output harus diperlakukan tidak tepercaya dan divalidasi terhadap schema/allowlist.
15. Setiap event memiliki tepat satu mode inventori; mode tidak boleh diubah setelah order, reservasi, atau tiket Paid ada.
16. Satu `EventSeat` paling banyak memiliki satu hold aktif atau satu Ticket Paid.
17. Checkout `RESERVED_SEATING` menahan kursi spesifik selama 15 menit; Failed/Expired/Cancelled melepaskan hold tepat satu kali.
18. Request yang tidak sesuai mode event ditolak dengan `INVENTORY_MODE_MISMATCH`; kursi yang sudah di-hold atau Paid ditolak dengan `SEAT_UNAVAILABLE`.

## 10. Persyaratan Data

| Entitas | Data Minimum |
|---|---|
| **User** | ID, nama, username, email, password hash/Google ID, status |
| **Role/Permission** | user, organizer capability, admin, assignment petugas |
| **OrganizerProfile** | owner, nama, kontak, deskripsi, status, alasan keputusan |
| **Event** | organizer, nama, deskripsi, kategori, gambar, venue, alamat, waktu, status, inventory mode |
| **TicketType** | event, nama, harga, kuota, jadwal penjualan, limit; merepresentasikan kategori/area pada mode Zoned/Reserved |
| **VenueSection** | event, nama area, urutan tampilan, kategori/harga terkait |
| **SeatMapAsset** | event, object storage key, alt text/legenda, MIME/ukuran |
| **EventSeat** | event, section, label kursi, status, hold/ticket reference |
| **Order/OrderItem** | pembeli, snapshot item/harga/kategori/kursi, total, expiry, status |
| **InventoryReservation** | order, ticket type, jumlah, expiry, released timestamp; hold kursi spesifik untuk Reserved Seating |
| **Payment** | order, provider, external reference, metode, nominal, status, payload hash |
| **Ticket** | order item, event, token hash, status, issued timestamp, snapshot kategori/label kursi |
| **CheckInAttempt** | ticket nullable, event, petugas, hasil, timestamp |
| **Refund** | order/payment, nominal, alasan, status, referensi provider |
| **AuditLog** | aktor, aksi, entitas, before/after terfilter, timestamp |
| **Notification** | penerima, tipe, isi, status baca/kirim |
| **LoyaltyAccount** | pembeli, organizer, saldo terproyeksi dari ledger |
| **LoyaltyLedgerEntry** | pembeli, organizer, order/refund, tipe earn/redeem/reversal/restore, jumlah integer, timestamp, idempotency reference |
| **LoyaltyPointReservation** | pembeli, organizer, order, jumlah integer, status, expiry/released/consumed timestamp |

Data kartu atau kredensial pembayaran tidak boleh disimpan.
Poster, OCR, prompt, query bahasa alami, output model, dan saran AI tidak menjadi entitas bisnis persisten. Observability AI hanya menyimpan metadata operasional teredaksi sesuai kebijakan retensi.

## 11. Persyaratan Teknis dan Integrasi

### 11.1 Baseline Teknologi

- **Aplikasi:** API/transaksi Go 1.27; UI Next.js/React/TypeScript.
- **Autentikasi:** sesi server-side Go (RFC-002); prototype NextAuth bukan target.
- **Database:** PostgreSQL pada Neon; migrasi goose terversi.
- **Hosting:** provider non-Vercel yang menjalankan binary Go dan UI Node.js.
- **Payment:** satu adapter gateway sandbox agar provider dapat diganti tanpa mengubah domain Order.
- **AI:** port provider-neutral untuk poster extraction dan intent parsing; domain tidak bergantung pada SDK/model tertentu.
- **QR:** token minimal 128-bit entropy atau payload yang ditandatangani; database menyimpan hash token bila memungkinkan.

### 11.2 Komponen Infrastruktur

| Komponen | Kebutuhan |
|---|---|
| **Web runtime** | UI Next.js plus API Go; webhook dan job di proses Go |
| **PostgreSQL** | Transaksi atomik, constraint, indeks, backup |
| **Object storage** | Gambar event; file tidak disimpan di filesystem runtime |
| **Scheduler/cron** | Mengakhiri reservasi dan order yang melewati 15 menit |
| **Payment sandbox** | Checkout, status, signature webhook, dan refund sandbox bila tersedia |
| **Email provider** | Konfirmasi transaksi dan reminder wajib; kegagalan tidak boleh membatalkan transaksi utama |
| **AI provider** | Ekstraksi saran poster dan parsing intent; dipilih melalui decision gate dengan fake deterministik untuk test |
| **Observability** | Structured log, error tracking, health check, dan metrik webhook |

### 11.3 Transaksi Kritis

- Reservasi kuota dan hold kursi menggunakan transaksi database dan atomic conditional update/locking.
- Penerbitan tiket berjalan dalam transaksi yang terikat pada perubahan pertama Order ke Paid.
- Check-in menggunakan conditional update `Unused → Used`; hasil update nol berarti tiket sudah digunakan/tidak valid.
- Webhook disimpan dengan event ID unik untuk idempotensi dan audit.
- Job kedaluwarsa aman dijalankan berulang.
- Reservasi poin dilakukan dalam transaksi yang sama dengan pembuatan order; release dan konversi memakai conditional update/idempotency key.
- Ledger loyalitas bersifat append-only; koreksi dilakukan dengan entri kompensasi, bukan update/delete histori.
- Perhitungan earn, redeem, reversal, dan restore hanya menggunakan integer Rupiah/poin dengan aturan pembulatan yang terdokumentasi.

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
- Gambar poster dan teks OCR/AI diperlakukan sebagai input tidak tepercaya; validasi MIME/ukuran, cegah prompt injection memengaruhi aksi/otorisasi, redaksi PII, rate limit, dan terapkan kebijakan retensi.
- Prompt, gambar poster, output model mentah, dan natural-language query tidak boleh dicatat utuh bila memuat PII/rahasia; log hanya metadata aman yang diperlukan.
- Output AI dibatasi schema/allowlist dan tidak boleh mengeksekusi SQL, membuat event, mengajukan moderasi, menerbitkan event, atau melewati ownership/RBAC.
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
- `recommendation_viewed/selected` tanpa mengekspos riwayat pembelian
- `loyalty_points_reserved/released/earned/redeemed/reversed/restored`
- `ai_poster_processed/applied/rejected` dan `ai_search_parsed/fallback` dengan metadata teredaksi

Event analitik tidak boleh mengirim token QR, password, atau data pribadi yang tidak diperlukan.

### 13.2 Target MVP

| Metrik | Metode | Target |
|---|---|---|
| Kelulusan Must Have | UAT dan test report | 100% |
| Task completion | Minimal 5 peserta menjalankan tugas inti | ≥ 90% tugas selesai tanpa bantuan langsung |
| SUS | Kuesioner setelah uji | ≥ 68 |
| Overselling | Concurrent integration test termasuk dua pembeli pada kursi yang sama | 0 |
| Check-in ganda | Concurrent integration test | 0 |
| Akurasi webhook | Skenario sukses, gagal, expired, duplikat, signature salah | 100% skenario wajib lulus |
| Defect blocker/critical | Defect log | 0 terbuka |
| Security Critical/High | Scan dan checklist | 0 terbuka |

Metrik adopsi dan pendapatan tidak digunakan untuk menilai MVP akademik karena tidak ada transaksi nyata.

## 14. Strategi Pengujian

| Tingkat | Fokus |
|---|---|
| **Unit** | Perhitungan ketersediaan, transisi status, expiry, otorisasi, dan ketersediaan kursi |
| **Integration** | Transaksi kuota, hold kursi bersamaan, webhook replay, penerbitan tiket, check-in atomik |
| **Loyalty** | Reservasi/release/konversi poin, ledger append-only, refund reversal/restore, dan konkurensi saldo |
| **AI contract/security** | Schema output, invalid/untrusted input, prompt injection, timeout/rate limit, redaksi, provider failure, dan deterministic fake |
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
- Skenario smoke test login, publish event, checkout termasuk kursi bernomor, webhook, tiket, dan check-in lulus.
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

**Anggaran baseline:** gunakan free tier/academic tier, gateway sandbox, dan data uji. Biaya domain, email, AI, object storage, atau peningkatan kapasitas harus disetujui terpisah. Jika kapasitas engineer kurang dari asumsi, fitur Should/Could harus dipotong sebelum menurunkan kualitas transaksi Must Have. Seluruh 57 Must Have tetap wajib; perubahan target 12 minggu atau scope Must memerlukan persetujuan Product Owner.

## 17. Urutan Implementasi dan Jalur Kritis

Jalur kritis:

`Keputusan gateway/AI & model data → Role/ownership → Event, ticket type, section/seat & AI draft → Katalog/filter/AI search → Reservasi order+poin/hold kursi → Webhook pembayaran+ledger → Penerbitan tiket → Check-in atomik → Rekomendasi/notifikasi/ekspor/reminder → UAT`

| Fase | Minggu | Deliverable | Exit Criteria |
|---|---|---|---|
| Scope dan desain | 1 | Keputusan gateway/AI, data model termasuk loyalty, wireframe, test plan | Decision gate ditutup |
| Fondasi akses | 2 | Role, ownership, organizer application, migrasi | Uji akses lulus |
| Event dan discovery | 3–4 | Moderasi event, ticket type, section/seat, denah statis, katalog/filter, AI poster draft, AI natural-language search | Event dapat Published; output AI tetap berupa saran draft atau filter |
| Order dan reservasi | 5 | Checkout, atomic inventory/poin/hold kursi, expiry job | Uji overselling, kursi bersamaan, dan konkurensi poin lulus |
| Payment sandbox | 6–7 | Adapter, checkout provider, webhook idempoten, ledger loyalty | Skenario webhook dan ledger lulus |
| Ticket dan check-in | 8–9 | QR, wallet, scanner, atomic check-in | Uji double scan lulus |
| Dashboard dan hardening | 10 | Rekomendasi berbasis histori Paid, ekspor termasuk label kursi, email/reminder, audit, pembatalan/refund sandbox | 57 Must Have lengkap |
| Verifikasi | 11 | E2E, security AI, loyalty concurrency, load, usability | Release gate lulus |
| Rilis akademik | 12 | Deployment, laporan hasil, demo | Definition of Done terpenuhi |

Target tetap 12 minggu, tetapi penambahan kapabilitas wajib membuat risiko jadwal **tinggi**. Fitur Should/Could dikerjakan hanya jika jalur kritis tidak tertunda; Must Have tidak boleh dipindahkan ke fase pasca-MVP tanpa scope change baru.

## 18. Dependensi Pihak Ketiga

| Dependensi | Kebutuhan | Risiko/Fallback |
|---|---|---|
| **Neon/PostgreSQL** | Database dan transaksi | Gunakan lingkungan terpisah dan backup |
| **NextAuth/Google OAuth** | Login | Username/password tetap tersedia |
| **Payment gateway sandbox** | Metode bayar, webhook, refund test | Adapter provider dan simulator webhook untuk test |
| **Object storage** | Gambar event dan denah venue statis | Placeholder gambar bila belum dipilih |
| **Email provider** | Email transaksi dan reminder Must Have | Adapter, retry terbatas, dan fake deterministik; provider dipilih pada decision gate |
| **AI provider** | F76 poster extraction dan F77 intent parsing | Port provider-neutral, timeout/fallback, rate limit, dan fake deterministik; tanpa SDK sebelum gate |
| **Browser camera API** | Scanner | Input kode manual sebagai Should Have |

## 19. Risiko dan Mitigasi

| Risiko | Dampak | Probabilitas | Mitigasi |
|---|---|---|---|
| Cakupan 57 Must Have terlalu besar untuk satu engineer/12 minggu | Tinggi | Tinggi | Potong Should/Could, spike lebih awal, integrasikan per jalur kritis, dan eskalasi kapasitas/deadline tanpa menurunkan Must secara diam-diam |
| Gateway sandbox sulit diakses/dikonfigurasi | Tinggi | Sedang | Pilih pada minggu 1; sediakan adapter dan simulator |
| Overselling kuota atau kursi akibat race condition | Tinggi | Sedang | Transaksi, constraint, hold 15 menit, dan concurrent test dua pembeli pada kursi yang sama |
| Webhook terlambat atau duplikat | Tinggi | Tinggi | Idempotensi, event log, rekonsiliasi |
| QR digunakan ulang | Tinggi | Sedang | Token aman dan conditional update atomik |
| Koneksi venue buruk | Sedang | Sedang | Pesan error jelas dan kode manual; offline di luar MVP |
| Data pribadi bocor | Tinggi | Rendah–Sedang | Data uji, minimisasi, RBAC, log redaction |
| Target kinerja tidak sesuai hosting gratis | Sedang | Sedang | Ukur awal; dokumentasikan batas platform |
| Race condition reservasi atau refund poin | Tinggi | Sedang | Transaction/locking, ledger append-only, idempotensi, dan concurrent integration test |
| Output AI salah atau prompt injection dari poster/query | Tinggi | Sedang | Output schema/allowlist, treat input as untrusted, human review untuk poster, PostgreSQL-only retrieval, redaksi, dan security test |
| Provider AI/email tidak tersedia atau biaya melebihi tier | Tinggi | Sedang | Decision gate minggu 1, adapter provider-neutral, fake untuk test, fallback standar untuk AI search, dan error yang tidak merusak transaksi |

## 20. Decision Gates dan Pertanyaan Terbuka

### Wajib Diputuskan Sebelum Implementasi Jalur Kritis

1. **Gateway sandbox:** provider, akses akun, metode yang benar-benar tersedia, dan format webhook.
2. **Object storage:** provider atau keputusan menggunakan placeholder selama MVP.
3. **Provider AI:** pilih provider/model yang memenuhi ekstraksi terstruktur, intent parsing, retensi/redaksi, rate limit, biaya tier akademik, timeout, dan observability; pertahankan kontrak provider-neutral dan jangan pilih SDK sebelum gate disetujui.
4. **Email provider:** pilih provider, domain/sender sandbox, quota, retry, dan batas deliverability untuk notifikasi serta reminder wajib.
5. **Tanggal kalender dan kapasitas engineer:** konfirmasi mitigasi risiko 57 Must Have tanpa mengubah target baseline 12 minggu.
6. **Pemilik keputusan:** siapa yang menyetujui perubahan scope dan hasil UAT.

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
3. Uji overselling, hold kursi bersamaan, webhook replay, dan double scan lulus tanpa pelanggaran invarian.
4. Uji loyalty membuktikan isolasi buyer–organizer, batas redeem 20%, reservasi/release/konversi atomik, ledger append-only, serta reversal/restore refund yang idempoten.
5. F74 hanya merekomendasikan Published future event dan F77 selalu menggunakan filter tervalidasi dengan PostgreSQL sebagai sumber hasil serta fallback standar.
6. F76 terbukti tidak dapat auto-submit/publish dan seluruh saran memerlukan review/apply/save manusia.
7. Tidak ada defect blocker/critical atau temuan security Critical/High terbuka, termasuk prompt injection, retensi/redaksi, dan abuse path AI.
8. Target kinerja diukur pada profil uji dan hasilnya dilaporkan.
9. Uji kegunaan dilaksanakan, task completion dan SUS dihitung.
10. Migrasi, environment, seed/reset data, deployment, monitoring, provider fake, dan rollback terdokumentasi.
11. Batas sandbox, tidak adanya nilai tunai poin, serta larangan penggunaan uang/data nyata terlihat jelas pada demo dan dokumentasi.

## 22. Matriks Ketertelusuran Ringkas

| Tujuan | User Story | Bukti |
|---|---|---|
| Organizer mengelola event | US-02, US-03, US-04, US-10 | E2E organizer dan UAT |
| Pembeli membeli tiket | US-05, US-06, US-07, US-08 | E2E checkout dan webhook |
| Mencegah overselling | US-04, US-06 | Concurrent integration test kuota dan kursi yang sama |
| Mencegah tiket ganda | US-08, US-09 | Concurrent check-in test |
| Admin mengendalikan operasi | US-02, US-03, US-11, US-12 | UAT admin dan audit inspection |
| Nilai tambah discovery | US-05, US-13, US-16 | Test rekomendasi/filter dan fallback AI search |
| Loyalitas per organizer | US-14 | Concurrent integration test ledger/reservasi/refund |
| Bantuan draft organizer | US-15 | Contract/security test dan UAT human review |
| Kursi bernomor dan denah statis | US-04, US-05, US-06, US-08, US-09 | Concurrent seat hold, a11y selector, dan snapshot tiket |
| Membuktikan kegunaan | Seluruh alur utama | Task completion dan SUS |
