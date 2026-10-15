# Mengaktifkan pembayaran Midtrans Sandbox

Ini integrasi gateway sungguhan (QRIS dan virtual account lewat Midtrans), tetap **uang uji**. Bukan Midtrans Production dan bukan transfer dana nasabah.

## 1. Ambil Server Key Sandbox

1. Masuk [MAP Midtrans](https://dashboard.sandbox.midtrans.com) atau dashboard utama lalu pilih environment **Sandbox**.
2. **Settings → Access Keys**.
3. Salin **Server Key**. Nilainya berawalan `SB-Mid-server-`.
4. Jangan pakai Client Key (`SB-Mid-client-`) dan jangan pakai kunci Production (`Mid-server-`). Aplikasi menolak keduanya.

## 2. Isi environment lokal

Di `.env.local`:

```
PAYMENT_PROVIDER=midtrans
MIDTRANS_SERVER_KEY=SB-Mid-server-...
WEB_ORIGIN=http://localhost:3000
```

Jangan commit file itu. Restart `npm run dev`.

Cek tanpa menampilkan kunci:

```
npm run midtrans-check
```

## 3. Channel pembayaran

Di MAP Sandbox, aktifkan QRIS dan Bank Transfer / VA (BCA, BNI, BRI, Mandiri, Permata) sesuai akun Anda.

## 4. Notifikasi (webhook)

Midtrans tidak dapat memanggil `localhost`. Untuk development:

- Pembeli menekan **Cek status** di halaman order (aplikasi membaca status API Midtrans).
- Atau pasang tunnel HTTPS publik (misalnya ngrok) lalu isi **Payment Notification URL**:
  `https://<host-publik>/api/webhooks/payments/midtrans`

## 5. Cara uji

1. Checkout tiket sampai halaman pembayaran.
2. Pilih QRIS atau Virtual Account + bank.
3. Instruksi muncul di halaman (QR atau nomor VA).
4. Bayar di **simulator Midtrans Sandbox** (tautan di halaman order), bukan aplikasi bank produksi.
   - QRIS: tempel **URL gambar QR** (`https://api.sandbox.midtrans.com/v2/qris/…/qr-code`) ke [simulator QRIS](https://simulator.sandbox.midtrans.com/v2/qris/index), Scan QR, Pay sekali.
   - Jika Scan berhasil tetapi Pay menulis *failed* dan dashboard tetap Pending: itu gagal di simulator Midtrans, bukan di MyTicketIn. Charge QRIS/GoPay tetap bisa dibuat; penyelesaian uji pakai **Virtual Account** atau **E-wallet ShopeePay** (bukan GoPay).
   - E-wallet: tombol **Lanjut di Midtrans**, pilih **ShopeePay**, jangan tekan Back. GoPay di Snap berubah jadi QRIS dan Pay-nya gagal di akun sandbox ini.
5. Kembali ke MyTicketIn, tekan **Cek status**. Tiket terbit hanya setelah status `settlement`.

Tombol **Simulasikan lunas** tidak tampil pada provider Midtrans.

## 6. Refund pembeli

Setelah order Midtrans **lunas** dan tiket belum check-in:

1. Pembatalan pembeli 75%. QRIS/e-wallet: tanpa rekening; virtual account: isi rekening tujuan.
2. QRIS/e-wallet: penyelenggara menekan **Setujui (refund Midtrans)**. Aplikasi memanggil `POST /v2/{order_id}/refund`. Dana uji kembali ke sumber bayar.
3. Virtual account: Midtrans **tidak** menyediakan Refund API. Setelah disetujui, unggah bukti transfer seperti jalur uji internal.
4. Jika Refund API gagal, **Kirim ulang ke Midtrans** memakai `refund_key` yang sama (hanya QRIS/e-wallet).

Pencairan ke rekening penyelenggara tetap transfer manual admin.

## 7. Pembayaran nyata

Bukan bagian runbook uji ini. Ikuti `docs/runbooks/midtrans-production.md`. Pencairan otomatis ke banyak rekening penyelenggara tetap tidak diaktifkan: dana pembeli masuk ke akun Midtrans, lalu pencairan ke penyelenggara masih pengajuan + transfer manual admin.
