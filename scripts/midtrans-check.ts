/**
 * Verifies Midtrans Sandbox config without printing secrets.
 * Usage: npx tsx --env-file=.env.local scripts/midtrans-check.ts
 */
import { classifyMidtransServerKey } from "../lib/server/midtrans";

const provider = String(process.env.PAYMENT_PROVIDER || "sandbox").trim().toLowerCase();
const paymentEnv = String(process.env.PAYMENT_ENV || "sandbox").trim().toLowerCase();
const kind = classifyMidtransServerKey(process.env.MIDTRANS_SERVER_KEY || "");
const origin = String(process.env.WEB_ORIGIN || "").trim();

console.log("PAYMENT_PROVIDER=" + provider);
console.log("PAYMENT_ENV=" + paymentEnv);
console.log("MIDTRANS_SERVER_KEY=" + kind);
console.log("WEB_ORIGIN_HTTPS=" + (origin.startsWith("https://") ? "yes" : "no"));

if (provider !== "midtrans") {
  console.log("Jalur aktif masih simulator internal. Set PAYMENT_PROVIDER=midtrans untuk QRIS/VA Midtrans Sandbox.");
  process.exit(kind === "production" ? 1 : 0);
}

if (kind === "sandbox-server") {
  if (paymentEnv === "production") {
    console.error("PAYMENT_ENV=production tidak cocok dengan kunci Sandbox. Pakai Server Key Mid-server- atau kembalikan PAYMENT_ENV=sandbox.");
    process.exit(1);
  }
  console.log("Siap uji: Server Key Sandbox. Restart npm run dev, bayar lewat QRIS/VA, lalu Cek status.");
  process.exit(0);
}

if (kind === "production") {
  if (paymentEnv !== "production") {
    console.error("Kunci Production terpasang, tetapi PAYMENT_ENV bukan production. Tambahkan PAYMENT_ENV=production hanya di server https publik.");
    process.exit(1);
  }
  if (!origin.startsWith("https://")) {
    console.error("WEB_ORIGIN harus https publik sebelum pembayaran nyata. Localhost tidak menerima notifikasi Midtrans.");
    process.exit(1);
  }
  console.log("Siap nyata: Midtrans Production. Pastikan Payment Notification URL mengarah ke /api/webhooks/payments/midtrans dan migrasi 0036 sudah jalan.");
  process.exit(0);
}
if (kind === "sandbox-client") {
  console.error("Ditolak: itu Client Key. Pakai Server Key Sandbox.");
  process.exit(1);
}
if (kind === "missing") {
  console.error("Kosong: isi MIDTRANS_SERVER_KEY di .env.local.");
  process.exit(1);
}
console.error("Format kunci tidak dikenali. Server Key Sandbox harus berawalan SB-Mid-server-.");
process.exit(1);
