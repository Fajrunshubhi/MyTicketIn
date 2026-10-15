# Konsep Pembayaran dan Pencairan (disimpan, implementasi ditunda)

Status: pembayaran pembeli bisa uji atau nyata. Default uji. Mode nyata: `PAYMENT_ENV=production`, Server Key `Mid-server-`, `WEB_ORIGIN` https, migrasi `0036`, lalu `docs/runbooks/midtrans-production.md`. Pencairan otomatis ke penyelenggara tidak diaktifkan.

## Model dana (Opsi A: Midtrans + Payouts)
- Semua pembayaran pembeli masuk ke satu akun merchant Midtrans milik platform. Midtrans tidak memecah dana per penyelenggara.
- Setelah event selesai dan masa tahan lewat (`PAYOUT_HOLD_HOURS`, default 24 jam), penyelenggara mengajukan pencairan.
- Nominal pencairan per event = total order Paid − refund Completed (integer Rupiah). Belum ada biaya layanan.
- Admin mentransfer ke rekening terdaftar penyelenggara dan mengunggah bukti (manual pada MVP).

## Yang sudah ada di kode
- Provider dipilih lewat `PAYMENT_PROVIDER=sandbox|midtrans` (default `sandbox`, dipakai tes/CI).
- Midtrans Sandbox: QRIS (Core API, QR di halaman order), virtual account (Core API, nomor VA di halaman order; bank BCA/BNI/BRI/Mandiri/Permata), e-wallet (Snap redirect GoPay/ShopeePay). Webhook dengan verifikasi signature SHA-512 dan pembacaan ulang status dari status API, tombol "Cek status". Tiket hanya terbit setelah `settlement`. Hanya Server Key `SB-Mid-server-...` yang diterima. Simulator internal (`PAYMENT_PROVIDER=sandbox`) menampilkan QR/VA uji dan tombol "Simulasikan lunas".
- Pencairan: `lib/server/payouts.ts`, menu `/dashboard/payouts` (penyelenggara) dan `/admin/payouts` (admin), migrasi `0033`.

## Yang perlu disiapkan saat dilanjutkan
1. Jalankan `npm run migrate` di production untuk 0031, 0032, 0033.
2. Isi env: `MIDTRANS_SERVER_KEY` (sandbox), `PAYMENT_PROVIDER=midtrans`, `WEB_ORIGIN`.
3. Isi Payment Notification URL di dashboard Midtrans Sandbox: `https://<domain>/api/webhooks/payments/midtrans`.
4. Pastikan penyelenggara lama melengkapi rekening (butuh persetujuan admin).

## Jika kelak otomatis lewat Midtrans Payouts (Iris)
- Aktivasi akun Payouts (terpisah dari akun pembayaran) lewat tim Midtrans.
- Pilih skema aggregator (saldo top-up) atau facilitator (rekening sendiri sebagai sumber dana).
- Peran Creator dan Approver terpisah; daftarkan rekening penerima.
- Ganti langkah transfer manual admin dengan `POST /iris/api/v1/payouts` lalu `/payouts/approve`, dengan idempotensi dan rekonsiliasi hasil.

## Catatan regulasi dan alternatif
- Menampung dana pembeli lalu meneruskannya ke penjual adalah kegiatan Penyedia Jasa Pembayaran (PBI 23/6/PBI/2021) dan butuh izin Bank Indonesia. Untuk produk komersial, gunakan penyedia berizin yang memegang dana; ini bukan nasihat hukum.
- Alternatif tanpa dana melewati rekening platform: Xendit xenPlatform (sub-account + split rule).

## Aturan refund saat ini
- Pembatalan pembeli 75%, pembatalan event 100%. Setelah pencairan event diajukan, refund baru untuk event itu diblokir.
- QRIS dan e-wallet Midtrans: setelah disetujui, aplikasi memanggil `POST /v2/{order_id}/refund` (idempotency `refund_key`). Dana kembali ke sumber bayar. Webhook `refund`/`partial_refund` atau Cek status menyelesaikan status.
- Virtual account Midtrans: Refund API tidak tersedia (dokumentasi Midtrans). Tetap hold 24 jam + bukti transfer ke rekening pembeli. Dashboard Midtrans tetap menampilkan Settlement dan pendapatan bruto untuk transaksi VA; pencatatan refund ada di MyTicketIn.
- Order uji internal (`PAYMENT_PROVIDER=sandbox`): hold 24 jam + bukti transfer. Bukan Iris/payout organizer.
