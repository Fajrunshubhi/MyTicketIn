# Pembayaran pembeli nyata (Midtrans Production)

Ini menerima uang pembeli sungguhan melalui Midtrans. MyTicketIn bukan penyelenggara jasa pembayaran: dana masuk ke akun merchant Midtrans Anda. Pencairan otomatis ke rekening banyak penyelenggara tidak bagian dari langkah ini.

Syarat dari dokumentasi Midtrans ([Switching to Production](https://docs.midtrans.com/docs/switching-to-production-mode), [migrasi akun](https://docs.midtrans.com/docs/how-do-i-migrate-my-account-from-sandbox-to-production)):

1. Akun Production sudah disetujui (dokumen legal Midtrans selesai).
2. Channel QRIS dan bank transfer/VA aktif di **Settings → Snap Preferences → Payment Channels** pada environment Production.
3. Server Key Production (awalan `Mid-server-`) dari **Settings → Access Keys**. Bukan Client Key.
4. Situs dapat diakses publik lewat HTTPS. `WEB_ORIGIN` sama dengan URL itu, bukan `localhost`.
5. Payment Notification URL: `https://<domain>/api/webhooks/payments/midtrans` dan uji di dashboard mengembalikan 200.

## Environment

```
PAYMENT_PROVIDER=midtrans
PAYMENT_ENV=production
MIDTRANS_SERVER_KEY=Mid-server-...
WEB_ORIGIN=https://domain-anda
```

Jangan commit kunci. Jalankan `npm run migrate` agar migrasi `0036` mengizinkan `environment = PRODUCTION`, lalu `npm run midtrans-check`.

Di mesin lokal dengan `WEB_ORIGIN=http://localhost:3000`, mode nyata sengaja ditolak. Uji alur di localhost memakai `PAYMENT_ENV=sandbox` dan kunci `SB-Mid-server-`.

## Setelah hidup

- QRIS dan virtual account tampil di halaman order.
- Tiket terbit hanya setelah status `settlement` (webhook atau tombol Cek status).
- Transaksi pertama yang disarankan Midtrans adalah nominal kecil, misalnya Rp10.000, untuk memastikan notifikasi masuk.
- Refund pembeli order Midtrans memakai Refund API (kembali ke QRIS/VA/e-wallet sumber). Pencairan ke penyelenggara tetap transfer manual admin.
