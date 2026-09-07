# Product Requirements Document (PRD) — TicketIn

| Atribut | Nilai |
|---|---|
| **Nama produk** | TicketIn |
| **Versi dokumen** | 1.0 |
| **Status** | Draft untuk validasi pemangku kepentingan |
| **Jenis rilis** | Minimum Viable Product (MVP) / proyek akademik |
| **Platform** | Aplikasi web responsif |
| **Pasar awal** | Indonesia, event tatap muka |
| **Model bisnis MVP** | Belum dimonetisasi; fokus pada validasi alur dan pengujian pengguna |
| **Pemilik produk** | TBD |
| **Tanggal target rilis** | TBD |

## 1. Gambaran Umum

TicketIn adalah platform tiket event berbasis web yang mempertemukan **penyelenggara event** dengan **pembeli tiket**. Penyelenggara dapat membuat dan mengelola beberapa event beserta jenis, harga, kuota, dan periode penjualan tiket. Pembeli dapat menemukan event, membayar tiket melalui metode pembayaran Indonesia, menerima e-ticket berkode QR, serta melihat status tiket yang dimiliki.

Pada hari pelaksanaan, penyelenggara memindai QR untuk memvalidasi tiket. Sistem harus mencegah tiket yang sama digunakan lebih dari satu kali. **Admin platform** bertanggung jawab atas verifikasi organizer dan event, pengawasan transaksi, serta penanganan pembatalan dan refund.

Nilai utama TicketIn:

- **Bagi organizer:** satu tempat untuk menerbitkan event, menjual tiket, memantau penjualan, dan melakukan check-in.
- **Bagi pembeli:** proses pencarian hingga menerima tiket yang sederhana, aman, dan mudah dilacak.
- **Bagi admin:** kontrol terpusat terhadap kualitas event, transaksi, refund, dan penyalahgunaan tiket.

## 2. Latar Belakang dan Masalah

Proses penjualan tiket yang tersebar melalui formulir, pesan pribadi, dan transfer manual menimbulkan beberapa masalah:

- Informasi event dan ketersediaan tiket sulit ditemukan atau tidak selalu mutakhir.
- Organizer harus merekap pesanan, pembayaran, kuota, dan kehadiran secara manual.
- Pembeli tidak memiliki satu tempat untuk melihat tiket aktif, telah digunakan, atau dibatalkan.
- Tiket digital yang tidak memiliki validasi terpusat mudah digunakan ulang.
- Admin atau organizer sulit menelusuri status transaksi dan menyelesaikan sengketa.

TicketIn menyelesaikan masalah tersebut melalui alur end-to-end dari publikasi event sampai check-in.

## 3. Tujuan dan Sasaran

### 3.1 Tujuan Produk

1. Memungkinkan organizer menerbitkan dan mengelola beberapa event tanpa bantuan teknis.
2. Memungkinkan pembeli menemukan event dan menyelesaikan pembelian tiket secara end-to-end.
3. Menghasilkan e-ticket QR unik setelah pembayaran terkonfirmasi.
4. Memastikan tiket hanya dapat divalidasi satu kali oleh petugas yang berwenang.
5. Menyediakan visibilitas operasional bagi organizer dan admin.
6. Membuktikan kelayakan produk melalui pengujian fungsional dan pengujian pengguna dalam konteks proyek akademik.

### 3.2 Sasaran Terukur MVP

| Sasaran | Target penerimaan MVP |
|---|---|
| Kelengkapan alur inti | **100%** skenario penerimaan P0 lulus |
| Keberhasilan tugas pengguna | Minimal **90%** peserta uji menyelesaikan tugas inti tanpa bantuan langsung |
| Integritas check-in | **100%** percobaan penggunaan ulang QR ditolak dalam pengujian |
| Integritas inventori | **0** kasus overselling pada pengujian konkurensi yang disepakati |
| Keandalan pembayaran | Minimal **95%** transaksi sandbox valid diproses ke status akhir yang benar |
| Kualitas kegunaan | Skor **System Usability Scale (SUS) ≥ 68** |
| Keamanan dasar | Tidak ada temuan keamanan tingkat kritis/tinggi yang belum ditangani sebelum demo/rilis |

Target adopsi bisnis seperti jumlah organizer aktif, event terbit, dan nilai transaksi belum ditetapkan karena MVP belum berfokus pada monetisasi.

## 4. Cakupan

### 4.1 Termasuk dalam MVP

- Registrasi dan login menggunakan username/kata sandi atau Google.
- Peran dan otorisasi untuk pembeli, organizer, dan admin.
- Pengajuan serta verifikasi organizer.
- Pembuatan, pengubahan, pengajuan, publikasi, dan pembatalan event.
- Dukungan beberapa event per organizer.
- Jenis/kelas tiket dengan harga, kuota, dan periode penjualan.
- Katalog, pencarian, penyaringan dasar, dan halaman detail event.
- Checkout satu event, pemesanan, dan pembayaran melalui payment gateway.
- Metode pembayaran Indonesia: **QRIS, virtual account, dan e-wallet**, sesuai dukungan gateway terpilih.
- Sinkronisasi status pembayaran melalui callback/webhook yang idempoten.
- Penerbitan e-ticket QR unik setelah pembayaran berhasil.
- Daftar tiket pembeli dengan status belum digunakan, digunakan, dibatalkan, atau direfund.
- Pemindaian dan validasi QR oleh organizer/petugas event.
- Dashboard organizer untuk ringkasan penjualan, tiket, dan check-in.
- Dashboard admin untuk moderasi pengguna, organizer, event, transaksi, dan refund.
- Refund yang diproses atau disetujui oleh admin.
- Audit aktivitas penting dan notifikasi transaksional dasar.

### 4.2 Dikecualikan dari MVP

- Event online atau hybrid.
- Aplikasi mobile native.
- Multiwilayah, multimata uang, dan bahasa selain Bahasa Indonesia.
- Marketplace sekunder, penjualan ulang, transfer, atau gifting tiket.
- Dynamic pricing, kursi bernomor, waiting list, kode promo, dan program loyalitas.
- Keranjang yang menggabungkan tiket dari beberapa event.
- Langganan organizer, biaya layanan, komisi, atau monetisasi lain.
- Payout organizer otomatis dan rekonsiliasi keuangan tingkat enterprise.
- Integrasi perangkat turnstile atau scanner khusus.
- Refund otomatis tanpa pemeriksaan admin.
- Sistem rekomendasi berbasis AI.

### 4.3 Kandidat Rilis Berikutnya

1. Kursi bernomor dan denah venue.
2. Voucher, promosi, dan referral.
3. Transfer tiket yang aman.
4. Payout organizer otomatis.
5. Event online/hybrid.
6. Aplikasi mobile dan mode scanner offline.
7. Analitik organizer tingkat lanjut.
8. Monetisasi melalui biaya layanan atau paket langganan.

## 5. Persona Pengguna

| Persona | Karakteristik | Tujuan Utama | Masalah yang Dihadapi |
|---|---|---|---|
| **Pembeli/Peserta** | Pengguna Indonesia yang mencari dan menghadiri event; mengakses melalui ponsel atau desktop | Menemukan event, membayar dengan metode yang familiar, dan menunjukkan tiket dengan cepat | Informasi tersebar, pembayaran tidak jelas, tiket sulit ditemukan, kekhawatiran tiket tidak valid |
| **Organizer** | Individu atau organisasi yang menyelenggarakan satu atau beberapa event bertiket | Menerbitkan event, mengontrol kuota, memantau penjualan, dan memvalidasi peserta | Rekap manual, overselling, status pembayaran tidak sinkron, check-in lambat |
| **Petugas Check-in** | Anggota tim organizer di lokasi event, umumnya menggunakan ponsel | Memindai tiket dengan cepat dan memperoleh hasil validasi yang tegas | Antrean, koneksi tidak stabil, QR duplikat, ketidakjelasan status tiket |
| **Admin Platform** | Pengelola operasional dan kepatuhan TicketIn | Menjaga kualitas event, menangani masalah transaksi, refund, dan penyalahgunaan | Sulit menelusuri perubahan, kurangnya bukti audit, proses sengketa tidak konsisten |

## 6. Prinsip dan Aturan Bisnis

1. Hanya organizer yang telah disetujui admin yang dapat mengajukan event untuk dipublikasikan.
2. Event harus berstatus **Published** agar terlihat dan dapat dibeli publik.
3. Setiap jenis tiket memiliki harga, kuota, jadwal penjualan, dan batas pembelian per transaksi.
4. Sistem tidak boleh menjual tiket melebihi kuota. Reservasi inventori saat pembayaran tertunda harus dilepas setelah waktu kedaluwarsa.
5. Pesanan baru dianggap dibayar setelah konfirmasi tepercaya dari payment gateway diterima.
6. Callback pembayaran harus idempoten; callback yang dikirim ulang tidak boleh membuat tiket atau transaksi ganda.
7. Satu unit tiket menghasilkan satu QR unik yang tidak mudah ditebak atau dipalsukan.
8. QR hanya valid untuk event terkait dan hanya dapat digunakan satu kali.
9. Check-in hanya dapat dilakukan oleh organizer pemilik event atau petugas yang diberi akses.
10. Pembatalan event menghentikan penjualan baru dan memulai proses penanganan pesanan terdampak.
11. Refund memerlukan pemeriksaan admin pada MVP dan harus mempunyai alasan serta jejak audit.
12. Perubahan harga atau kuota tidak boleh mengubah transaksi dan tiket yang telah dibayar.
13. Seluruh waktu transaksi disimpan secara konsisten dan ditampilkan sesuai zona waktu event.

Nilai durasi reservasi, batas pembelian, dan batas waktu refund masih memerlukan keputusan produk.

## 7. Persyaratan Fungsional

Prioritas:

- **P0 — Wajib:** diperlukan agar alur MVP end-to-end dapat berfungsi.
- **P1 — Penting:** diperlukan untuk operasi MVP yang terkendali, tetapi dapat disederhanakan.
- **P2 — Lanjutan:** kandidat setelah MVP tervalidasi.

### 7.1 Akun, Peran, dan Akses

| ID | Prioritas | Persyaratan |
|---|---|---|
| FR-AUTH-01 | P0 | Pengguna dapat mendaftar dan login menggunakan username/kata sandi. |
| FR-AUTH-02 | P0 | Pengguna dapat login menggunakan akun Google. |
| FR-AUTH-03 | P0 | Sistem membatasi halaman dan tindakan berdasarkan peran pembeli, organizer, petugas, dan admin. |
| FR-AUTH-04 | P0 | Pengguna dapat logout dan sesi yang berakhir tidak dapat digunakan kembali. |
| FR-AUTH-05 | P1 | Pengguna dapat memperbarui profil dan meminta pengaturan ulang kata sandi. |
| FR-AUTH-06 | P1 | Pengguna dapat mengajukan status organizer dengan data identitas yang disyaratkan. |
| FR-AUTH-07 | P1 | Organizer dapat memberi dan mencabut akses petugas check-in untuk event tertentu. |

### 7.2 Pengelolaan Organizer dan Event

| ID | Prioritas | Persyaratan |
|---|---|---|
| FR-EVT-01 | P0 | Organizer dapat membuat dan mengelola lebih dari satu event. |
| FR-EVT-02 | P0 | Event menyimpan nama, deskripsi, kategori, gambar, venue, alamat, tanggal/waktu, syarat, dan informasi kontak. |
| FR-EVT-03 | P0 | Organizer dapat menyimpan draft, mengubah, mengajukan publikasi, dan membatalkan event. |
| FR-EVT-04 | P0 | Admin dapat menyetujui atau menolak organizer dan event dengan alasan. |
| FR-EVT-05 | P0 | Sistem menerapkan status event: Draft, Pending Review, Published, Rejected, Cancelled, dan Completed. |
| FR-EVT-06 | P0 | Hanya event Published dalam periode penjualan yang dapat menerima pesanan. |
| FR-EVT-07 | P1 | Organizer dapat melihat pratinjau halaman event sebelum diajukan. |
| FR-EVT-08 | P1 | Sistem mengirim notifikasi ketika status pengajuan atau pembatalan berubah. |

### 7.3 Inventori Tiket

| ID | Prioritas | Persyaratan |
|---|---|---|
| FR-TIX-01 | P0 | Organizer dapat membuat beberapa jenis/kelas tiket untuk satu event. |
| FR-TIX-02 | P0 | Setiap jenis tiket mempunyai nama, harga, kuota, periode penjualan, dan batas pembelian. |
| FR-TIX-03 | P0 | Sistem menampilkan ketersediaan berdasarkan kuota terjual, tereservasi, dan tersisa. |
| FR-TIX-04 | P0 | Sistem melakukan reservasi inventori selama pembayaran tertunda dan melepasnya saat kedaluwarsa/gagal. |
| FR-TIX-05 | P0 | Sistem mencegah overselling saat beberapa pembeli checkout bersamaan. |
| FR-TIX-06 | P1 | Organizer dapat menghentikan penjualan suatu jenis tiket tanpa menghapus tiket yang telah dibeli. |

### 7.4 Penemuan Event dan Checkout

| ID | Prioritas | Persyaratan |
|---|---|---|
| FR-BUY-01 | P0 | Pengunjung dapat melihat daftar event Published tanpa harus login. |
| FR-BUY-02 | P0 | Pengunjung dapat mencari event berdasarkan kata kunci dan menyaring berdasarkan kategori, lokasi, atau tanggal. |
| FR-BUY-03 | P0 | Halaman detail menampilkan informasi event, organizer, jenis tiket, harga, jadwal, venue, dan ketersediaan. |
| FR-BUY-04 | P0 | Pengguna harus login sebelum checkout. |
| FR-BUY-05 | P0 | Pembeli dapat memilih jenis dan jumlah tiket sesuai kuota serta batas pembelian. |
| FR-BUY-06 | P0 | Sistem menampilkan ringkasan biaya dan meminta persetujuan sebelum membuat pembayaran. |
| FR-BUY-07 | P0 | Sistem membuat nomor pesanan unik dan menampilkan status pembayaran. |
| FR-BUY-08 | P1 | Pembeli dapat melihat riwayat pesanan gagal, kedaluwarsa, dibayar, dibatalkan, dan direfund. |

### 7.5 Pembayaran dan Refund

| ID | Prioritas | Persyaratan |
|---|---|---|
| FR-PAY-01 | P0 | Sistem mengintegrasikan payment gateway yang mendukung QRIS, virtual account, dan e-wallet. |
| FR-PAY-02 | P0 | Sistem memproses status Pending, Paid, Failed, Expired, Cancelled, dan Refunded. |
| FR-PAY-03 | P0 | Sistem memverifikasi keaslian callback/webhook dan memprosesnya secara idempoten. |
| FR-PAY-04 | P0 | Tiket hanya diterbitkan setelah pesanan berstatus Paid. |
| FR-PAY-05 | P0 | Pembeli dapat melihat instruksi, batas waktu, dan hasil pembayaran. |
| FR-PAY-06 | P1 | Admin dapat melihat detail transaksi dan memulai/mencatat refund beserta alasan. |
| FR-PAY-07 | P1 | Pembeli dan organizer menerima notifikasi perubahan status pembayaran/refund. |
| FR-PAY-08 | P2 | Sistem melakukan payout dan rekonsiliasi organizer secara otomatis. |

### 7.6 E-ticket dan Check-in

| ID | Prioritas | Persyaratan |
|---|---|---|
| FR-CHK-01 | P0 | Setiap tiket Paid memiliki identitas dan QR unik. |
| FR-CHK-02 | P0 | Pembeli dapat membuka tiket dari dashboard pada perangkat mobile. |
| FR-CHK-03 | P0 | Halaman tiket menampilkan event, pemilik tiket, jenis tiket, serta status penggunaan. |
| FR-CHK-04 | P0 | Petugas dapat memindai QR menggunakan kamera perangkat yang didukung browser. |
| FR-CHK-05 | P0 | Sistem menampilkan hasil Valid, Already Used, Invalid, Cancelled/Refunded, atau Wrong Event. |
| FR-CHK-06 | P0 | Validasi berhasil mengubah status tiket secara atomik menjadi Used dengan waktu dan petugas pemindai. |
| FR-CHK-07 | P0 | Pemindaian ulang tiket Used selalu ditolak dan tercatat. |
| FR-CHK-08 | P1 | Petugas dapat memasukkan kode tiket secara manual jika kamera gagal. |
| FR-CHK-09 | P2 | Scanner mendukung mode offline dengan sinkronisasi aman. |

### 7.7 Dashboard dan Administrasi

| ID | Prioritas | Persyaratan |
|---|---|---|
| FR-DAS-01 | P0 | Pembeli dapat melihat daftar tiket berdasarkan status belum digunakan, digunakan, dibatalkan, atau direfund. |
| FR-DAS-02 | P0 | Organizer dapat melihat ringkasan jumlah pesanan, tiket terjual, pendapatan bruto, dan check-in per event. |
| FR-DAS-03 | P0 | Organizer dapat melihat daftar peserta sesuai hak akses yang diizinkan. |
| FR-DAS-04 | P0 | Admin dapat mencari serta memeriksa pengguna, organizer, event, pesanan, pembayaran, tiket, dan refund. |
| FR-DAS-05 | P0 | Admin dapat menangguhkan akun atau event dengan alasan yang tercatat. |
| FR-DAS-06 | P1 | Data dashboard dapat difilter dan diekspor ke CSV. |
| FR-DAS-07 | P1 | Sistem mencatat audit log untuk perubahan status dan tindakan sensitif. |

### 7.8 Notifikasi

| ID | Prioritas | Persyaratan |
|---|---|---|
| FR-NOT-01 | P1 | Pembeli menerima konfirmasi pembayaran dan penerbitan tiket. |
| FR-NOT-02 | P1 | Pembeli menerima pemberitahuan pembatalan event dan perkembangan refund. |
| FR-NOT-03 | P1 | Organizer menerima hasil moderasi event dan pemberitahuan pembatalan/refund penting. |
| FR-NOT-04 | P1 | Notifikasi minimal tersedia di dalam aplikasi; email digunakan bila layanan telah dikonfigurasi. |

## 8. Kriteria Penerimaan Tingkat Produk

MVP dapat dinyatakan siap untuk demo/pengujian akhir ketika:

1. Organizer yang disetujui dapat membuat event, menambah jenis tiket, mengajukan event, dan memperoleh persetujuan admin.
2. Event yang disetujui muncul di katalog dan dapat ditemukan melalui pencarian.
3. Pembeli dapat memilih tiket, menyelesaikan pembayaran sandbox, dan menerima QR unik.
4. Kuota berkurang secara benar dan tidak terjadi overselling pada skenario uji konkurensi.
5. Petugas event dapat memindai tiket valid; pemindaian kedua ditolak.
6. Pembeli melihat perubahan status tiket, sedangkan organizer melihat perubahan jumlah check-in.
7. Admin dapat menelusuri transaksi dan mencatat refund untuk pembatalan.
8. Seluruh persyaratan P0 mempunyai bukti pengujian dan lulus.

## 9. Persyaratan Non-Fungsional

### 9.1 Kinerja

- Halaman katalog dan detail event memiliki waktu respons server **p95 ≤ 2 detik** pada kondisi uji normal.
- Interaksi utama halaman memiliki waktu muat yang dirasakan **≤ 3 detik** pada koneksi seluler wajar.
- Hasil validasi QR online ditampilkan **p95 ≤ 2 detik**.
- Sistem diuji minimal pada **100 sesi bersamaan** dan inventori hingga **10.000 tiket per event** sebagai baseline MVP; kapasitas produksi akhir adalah TBD.

### 9.2 Keandalan dan Integritas Data

- Perubahan inventori, penerbitan tiket, dan check-in harus atomik.
- Webhook pembayaran dan proses refund harus idempoten.
- Kegagalan layanan eksternal tidak boleh menghasilkan tiket Paid tanpa pembayaran yang valid.
- Tersedia mekanisme backup database dan prosedur pemulihan yang diuji sebelum rilis.
- Target ketersediaan deployment MVP adalah **99%** selama periode pengujian terjadwal, di luar pemeliharaan yang diumumkan.

### 9.3 Keamanan

- Semua koneksi produksi menggunakan HTTPS.
- Kata sandi disimpan menggunakan hashing adaptif; kata sandi asli tidak pernah disimpan atau dicatat.
- Otorisasi berbasis peran diterapkan dan diverifikasi pada server, bukan hanya antarmuka.
- Token QR harus acak atau ditandatangani, tidak memuat data sensitif secara terbuka, dan tidak dapat ditebak.
- Signature callback payment gateway harus diverifikasi.
- Rahasia, kredensial database, dan kunci gateway disimpan sebagai environment variable.
- Aplikasi menerapkan perlindungan terhadap risiko OWASP utama, termasuk injection, XSS, CSRF, brute force, dan broken access control.
- Tindakan admin, perubahan event, refund, dan check-in memiliki audit trail.
- Aplikasi tidak menyimpan nomor kartu atau kredensial pembayaran pengguna.

### 9.4 Privasi dan Kepatuhan

- Data pribadi yang dikumpulkan dibatasi pada kebutuhan transaksi dan operasional event.
- Akses organizer terhadap data peserta dibatasi pada event miliknya.
- Pengguna diberi informasi tentang tujuan pengumpulan dan penggunaan data.
- Kebijakan retensi serta penghapusan data harus ditetapkan sebelum penggunaan produksi.
- Implementasi produksi harus ditinjau terhadap kewajiban **UU Perlindungan Data Pribadi Indonesia** dan ketentuan payment gateway.

### 9.5 Skalabilitas dan Pemeliharaan

- Layanan aplikasi bersifat stateless sejauh mungkin agar dapat ditingkatkan secara horizontal.
- Database menggunakan indeks untuk pencarian event, status pesanan, identitas QR, dan relasi organizer.
- Modul autentikasi, event, inventori, pembayaran, ticketing, dan check-in dipisahkan secara logis.
- Migrasi skema database harus terversi dan dapat diterapkan ulang pada lingkungan pengujian.
- Kesalahan produksi dicatat tanpa mengekspos data pribadi atau rahasia.

### 9.6 Kompatibilitas dan Aksesibilitas

- Antarmuka responsif untuk ponsel, tablet, dan desktop.
- Mendukung dua versi terbaru Chrome, Edge, Firefox, dan Safari.
- Alur utama dapat digunakan dengan keyboard dan memiliki label formulir yang jelas.
- Target aksesibilitas adalah **WCAG 2.1 Level AA** untuk komponen dan alur utama.
- Pesan kesalahan menggunakan Bahasa Indonesia yang jelas dan memberikan langkah pemulihan.

## 10. Perjalanan Pengguna

### 10.1 Organizer Membuat dan Menerbitkan Event

1. Pengguna mendaftar/login dan mengajukan status organizer.
2. Admin memeriksa pengajuan dan menyetujui atau menolak dengan alasan.
3. Organizer membuat draft event dan melengkapi informasi event.
4. Organizer membuat satu atau beberapa jenis tiket beserta harga, kuota, dan periode penjualan.
5. Organizer meninjau lalu mengajukan event.
6. Admin menyetujui event.
7. Event berstatus Published dan tampil di katalog.
8. Organizer memantau pesanan, penjualan, dan check-in melalui dashboard.

### 10.2 Pembeli Menemukan dan Membeli Tiket

1. Pengunjung membuka katalog, mencari, dan menyaring event.
2. Pengunjung membuka detail event dan memilih jenis serta jumlah tiket.
3. Pengunjung login/daftar jika belum memiliki sesi.
4. Sistem memvalidasi ketersediaan lalu mereservasi kuota sementara.
5. Pembeli meninjau ringkasan dan memilih metode pembayaran.
6. Payment gateway memproses pembayaran.
7. Sistem menerima callback yang tervalidasi dan mengubah pesanan menjadi Paid.
8. Sistem menerbitkan e-ticket QR unik.
9. Pembeli melihat tiket pada dashboard dan menerima notifikasi.

### 10.3 Petugas Melakukan Check-in

1. Petugas login dan membuka scanner untuk event yang ditugaskan.
2. Petugas memindai QR milik peserta.
3. Sistem memeriksa event, status pembayaran, status refund/pembatalan, dan status penggunaan.
4. Jika valid, sistem mengubah tiket menjadi Used secara atomik dan menampilkan konfirmasi.
5. Jika tidak valid atau sudah digunakan, sistem menolak dan menampilkan alasan yang jelas.
6. Dashboard organizer memperbarui jumlah check-in.

### 10.4 Admin Menangani Pembatalan dan Refund

1. Organizer mengajukan pembatalan event dengan alasan.
2. Admin memeriksa dampak terhadap event dan pesanan Paid.
3. Sistem menghentikan penjualan dan menandai event Cancelled setelah disetujui.
4. Admin memulai atau mencatat refund melalui gateway/prosedur yang berlaku.
5. Status transaksi dan tiket diperbarui; QR terkait tidak lagi valid.
6. Pembeli dan organizer menerima notifikasi.
7. Seluruh tindakan tersimpan dalam audit log.

## 11. Model Status Utama

| Entitas | Status |
|---|---|
| **Organizer** | Pending, Approved, Rejected, Suspended |
| **Event** | Draft, Pending Review, Published, Rejected, Cancelled, Completed |
| **Pesanan/Pembayaran** | Pending, Paid, Failed, Expired, Cancelled, Refunded |
| **Tiket** | Reserved, Issued/Unused, Used, Cancelled, Refunded |
| **Refund** | Requested, Under Review, Approved, Rejected, Processing, Completed, Failed |

Transisi status harus divalidasi pada server dan tindakan sensitif harus dicatat.

## 12. Data Utama

MVP minimal memerlukan entitas berikut:

- **User:** identitas, kredensial, peran, dan status akun.
- **Organizer Profile:** data organizer dan status verifikasi.
- **Event:** detail event, pemilik, jadwal, venue, dan status moderasi.
- **Ticket Type:** harga, kuota, periode penjualan, dan batas pembelian.
- **Order:** pembeli, item, total, status, dan waktu kedaluwarsa.
- **Payment:** provider, referensi eksternal, metode, nominal, status, dan callback.
- **Ticket:** pemilik, event, jenis tiket, token QR, dan status penggunaan.
- **Check-in:** tiket, waktu, petugas, event, dan hasil validasi.
- **Refund:** transaksi, nominal, alasan, status, dan administrator pemroses.
- **Notification:** penerima, jenis, isi, status baca/kirim.
- **Audit Log:** aktor, tindakan, objek, waktu, dan metadata yang aman.

## 13. Kondisi Produk dan Pertimbangan Teknis

Prototipe saat ini telah mempunyai:

- Next.js 14, React, dan TypeScript.
- Autentikasi username/kata sandi serta Google melalui NextAuth.
- Penyimpanan akun pada PostgreSQL/Neon.
- Peran pengguna dasar dan halaman beranda setelah login.

Kemampuan event, inventori, pembayaran, QR, check-in, dashboard operasional, moderasi lengkap, dan refund masih perlu dibangun.

Arahan teknis MVP:

- **Frontend/backend web:** pertahankan Next.js dan TypeScript.
- **Database:** PostgreSQL/Neon dengan transaksi dan constraint untuk menjaga kuota serta check-in.
- **Autentikasi:** lanjutkan NextAuth dan perluas role-based access control.
- **Pembayaran:** pilih satu payment gateway Indonesia yang memenuhi metode MVP dan menyediakan sandbox serta webhook.
- **QR:** gunakan token acak/ditandatangani; QR hanya menjadi pengenal, sedangkan validasi final dilakukan di server.
- **Deployment:** gunakan lingkungan development, test/preview, dan production yang terpisah.

## 14. Metrik Keberhasilan

### 14.1 Metrik MVP Akademik

| Metrik | Cara Ukur | Target |
|---|---|---|
| Kelulusan persyaratan P0 | Automated test dan uji penerimaan | 100% lulus |
| Task completion rate | Uji pengguna pada alur organizer, pembelian, dan check-in | ≥ 90% |
| System Usability Scale | Kuesioner SUS setelah pengujian | ≥ 68 |
| Penolakan QR duplikat | Skenario tiket yang sama dipindai ≥2 kali | 100% ditolak |
| Overselling | Uji checkout bersamaan pada sisa kuota terbatas | 0 kasus |
| Akurasi status pembayaran | Perbandingan event sandbox dengan status internal | ≥ 95% benar dan seluruh mismatch ditelusuri |
| Temuan keamanan kritis/tinggi terbuka | Security checklist dan dependency scan | 0 sebelum rilis |
| Defect kritis terbuka | Defect log | 0 sebelum demo/rilis |

### 14.2 Metrik Produk Pasca-MVP

Target angka ditetapkan setelah baseline penggunaan tersedia.

- Jumlah organizer yang disetujui dan aktif per bulan — **TBD**.
- Jumlah event Published per bulan — **TBD**.
- Conversion rate halaman event ke pembelian Paid — **TBD**.
- Payment success rate transaksi nyata — **TBD**.
- Persentase check-in berhasil tanpa bantuan admin — **TBD**.
- Refund rate dan waktu penyelesaian refund — **TBD**.
- Repeat purchase rate pembeli — **TBD**.

## 15. Garis Waktu Tingkat Tinggi

Baseline berikut menggunakan **12 minggu** untuk perencanaan proyek akademik. Tanggal kalender dan kapasitas tim harus dikonfirmasi.

| Fase | Periode Usulan | Hasil Utama |
|---|---|---|
| 1. Validasi kebutuhan dan desain | Minggu 1–2 | PRD disetujui, alur, wireframe, pilihan gateway, rancangan data |
| 2. Fondasi domain dan akses | Minggu 3–4 | Peran, organizer, moderasi, event, dan jenis tiket |
| 3. Discovery, checkout, pembayaran | Minggu 5–7 | Katalog, pencarian, reservasi kuota, sandbox payment, webhook |
| 4. E-ticket dan check-in | Minggu 8–9 | Penerbitan QR, dashboard tiket, scanner, pencegahan penggunaan ulang |
| 5. Dashboard, refund, hardening | Minggu 10 | Dashboard organizer/admin, refund, audit log, notifikasi dasar |
| 6. Pengujian dan evaluasi | Minggu 11 | Uji integrasi, konkurensi, keamanan, kegunaan, dan perbaikan defect |
| 7. Rilis akademik | Minggu 12 | Deployment, dokumentasi, laporan metrik, demo, dan evaluasi |

### 15.1 Milestone Kelulusan

1. **M1 — Scope Freeze:** seluruh P0 dan aturan bisnis inti disetujui.
2. **M2 — Organizer Ready:** organizer dapat membuat event sampai siap dimoderasi.
3. **M3 — Purchase Ready:** pembeli dapat menyelesaikan pembayaran sandbox tanpa overselling.
4. **M4 — Check-in Ready:** QR diterbitkan dan penggunaan ulang ditolak.
5. **M5 — MVP Complete:** dashboard, moderasi, refund, dan audit minimum berfungsi.
6. **M6 — Academic Release:** seluruh target penerimaan MVP telah dievaluasi.

## 16. Dependensi

- Payment gateway Indonesia dengan sandbox, QRIS, virtual account, e-wallet, refund, dan webhook.
- Layanan PostgreSQL/Neon dan koneksi yang aman.
- OAuth Google untuk login sosial.
- Kamera browser/perangkat untuk pemindaian QR.
- Layanan email jika notifikasi email dimasukkan pada rilis.
- Data dan keputusan admin untuk kriteria verifikasi organizer/event.
- Peserta representatif untuk pengujian kegunaan.

## 17. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Callback pembayaran terlambat/berulang | Status salah atau tiket ganda | Verifikasi signature, idempotency key, rekonsiliasi berkala |
| Checkout bersamaan pada kuota terakhir | Overselling | Transaksi database, locking/atomic update, constraint |
| QR dibagikan atau dipakai ulang | Akses tidak sah | Token aman, validasi server, status Used atomik, audit |
| Koneksi venue buruk | Check-in lambat | Optimasi respons, fallback kode manual; mode offline dipertimbangkan pasca-MVP |
| Event palsu atau informasi menyesatkan | Kerugian pengguna dan reputasi | Verifikasi organizer dan moderasi event oleh admin |
| Refund manual lambat | Ketidakpuasan pembeli | Status refund transparan, SLA yang ditetapkan, audit proses |
| Cakupan terlalu besar untuk proyek akademik | Rilis terlambat | Dahulukan P0, sederhanakan P1, tunda seluruh P2 |
| Data pribadi terekspos | Risiko hukum dan keamanan | Least privilege, minimisasi data, enkripsi transit, audit akses |

## 18. Asumsi yang Perlu Divalidasi

Asumsi berikut digunakan untuk membuat PRD operasional, tetapi belum merupakan keputusan final:

- MVP adalah aplikasi web responsif untuk pasar Indonesia dan event tatap muka.
- Satu payment gateway dapat menyediakan seluruh metode pembayaran wajib.
- Refund diperiksa admin; detail eksekusi bergantung pada kemampuan gateway.
- Organizer menggunakan perangkat berkamera dan memiliki koneksi internet saat check-in.
- Timeline 12 minggu cukup jika tim memprioritaskan seluruh P0 dan menyederhanakan P1.
- Baseline beban 100 sesi bersamaan dan 10.000 tiket per event memadai untuk evaluasi MVP.

## 19. Pertanyaan Terbuka

Keputusan berikut harus diselesaikan sebelum **M1 — Scope Freeze**:

1. Apakah satu akun dapat sekaligus menjadi pembeli dan organizer, atau perannya eksklusif?
2. Data/dokumen apa yang wajib diberikan untuk verifikasi organizer?
3. Siapa yang menyetujui event dan berapa target waktu moderasinya?
4. Payment gateway mana yang digunakan, dan metode spesifik apa yang tersedia di sandbox?
5. Berapa lama inventori direservasi saat pembayaran Pending?
6. Berapa batas tiket per pembeli dan apakah batas berlaku per transaksi atau per akun?
7. Bagaimana kebijakan pembatalan event, refund sebagian/penuh, biaya gateway, dan target waktu penyelesaiannya?
8. Bagaimana penyelesaian dana kepada organizer dilakukan pada MVP jika payout otomatis dikecualikan?
9. Apakah tiket mencantumkan nama peserta dan apakah perubahan nama diperbolehkan?
10. Kanal notifikasi wajib apa yang digunakan: in-app saja, email, atau kanal lain?
11. Berapa jumlah dan profil peserta untuk pengujian kegunaan?
12. Apa tanggal rilis, ukuran tim, anggaran, serta batasan infrastruktur yang sebenarnya?
13. Berapa target adopsi pasca-MVP untuk organizer aktif, event Published, dan transaksi Paid?
14. Berapa lama data transaksi, tiket, audit log, dan data pribadi dipertahankan?

## 20. Definisi Selesai MVP

MVP dianggap selesai ketika:

- Semua persyaratan **P0** diimplementasikan dan lulus pengujian penerimaan.
- Alur organizer, pembeli, petugas check-in, dan admin dapat didemonstrasikan end-to-end.
- Integrasi pembayaran sandbox, penerbitan QR, pencegahan overselling, dan pencegahan penggunaan ulang terverifikasi.
- Tidak ada defect kritis atau temuan keamanan kritis/tinggi yang masih terbuka.
- Target pengujian pengguna dan SUS telah diukur serta hasilnya didokumentasikan.
- Deployment, skema database, variabel lingkungan, dan prosedur demo terdokumentasi.
- Pertanyaan terbuka yang memblokir operasi telah diputuskan atau dinyatakan sebagai batas eksplisit.
