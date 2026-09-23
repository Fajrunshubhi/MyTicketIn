# MyTicketIn — Next.js UI + API

UI dan HTTP API **Next.js 14** (`app/api` Route Handlers) pada PostgreSQL/Neon. Folder `backend/` Go adalah referensi perilaku sampai checklist RFC-021 §5; **runtime** tidak membutuhkan `cmd/api`.

## Stack

- Runtime: Route Handler Next.js + Neon
- Skema: SQL goose di `/migrations` (0001–0018)
- Runner migrasi: `npm run migrate` (Node, tabel `goose_db_version` yang sama)

Rencana paritas: `RFC/RFC-021.md`.

## 1. Database lokal vs Neon

Kode **tidak berubah** saat pindah lingkungan. Hanya `DATABASE_URL` dan `DATABASE_URL_UNPOOLED`.

### Pengembangan di Windows (disarankan sekarang)

Postgres lokal lewat Docker (data tetap di mesin Anda):

```bash
docker compose up -d
```

Lalu di `.env.local` (bukan Neon):

```env
DATABASE_URL=postgresql://myticketin:myticketin_dev@127.0.0.1:5432/myticketin?sslmode=disable
DATABASE_URL_UNPOOLED=postgresql://myticketin:myticketin_dev@127.0.0.1:5432/myticketin?sslmode=disable
```

Lokal tidak memakai pooler, jadi kedua URL **sama**. Setelah itu:

```bash
npm run migrate
```

Pakai host Neon **langsung** (`DATABASE_URL_UNPOOLED`), bukan hostname `-pooler`. API HTTP yang dijalankan adalah Next.js.

Jika memakai PostgreSQL Windows (bukan Docker), buat database `myticketin` lalu ganti user/password pada URL, tetap `127.0.0.1:5432` dan `sslmode=disable`.

### Deployment (nanti)

Di hosting, isi URL Neon: pooled → `DATABASE_URL`, direct (tanpa `-pooler`) → `DATABASE_URL_UNPOOLED`, `sslmode=require`. Jangan memakai localhost.

Vercel menjalankan Next.js (UI + `/api`). Isi `DATABASE_URL` (pooler Neon), `SESSION_SECRET` ≥32 karakter, dan secret QR/scheduler sesuai lingkungan. `NEXT_PUBLIC_API_BASE_URL` boleh dikosongkan (same-origin `/api`).

1. Jalankan `npm run migrate` ke Neon sekali (URL unpooled).
2. Env **Vercel**: `DATABASE_URL`, `SESSION_SECRET`, `WEB_ORIGIN` = URL situs. Jangan `localhost`.

## 2. Environment

Salin `.env.example` ke `.env.local`. Isi secret; **jangan** commit `.env.local`. Simpan URL Neon di catatan terpisah agar tinggal ditukar saat deploy.

## 3. Menjalankan aplikasi

Auth memakai sesi opaque cookie `mti_session` (bukan NextAuth).

```bash
npm install
npm run migrate
npm run dev
```

- Aplikasi: `http://localhost:3000`
- Health: `GET http://localhost:3000/api/health`
- Register/login: `POST /api/register` (hanya pembeli), `POST /api/auth/login` dengan `portal` (`buyer` \| `organizer` \| `admin`) + CSRF + cookie `mti_session`. Portal yang tidak cocok ditolak `AUTH_PORTAL_DENIED`.
- Google: isi `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` berpasangan; tombol disembunyikan jika kosong

Migrasi `0002_identity_session_rbac` bersifat additive pada tabel `users` RFC-001. Jalankan `npm run migrate` pada cabang/database uji sebelum production-demo.

`npm run db-check` hanya `SELECT 1`. Skema dibuat **hanya** oleh file di `/migrations`, bukan request path.

Strategi data RFC-001: **reset/tabel kosong**. Akun prototype tidak di-backfill. Jangan jalankan `0001` pada database yang sudah punya tabel `users` berbeda tanpa keputusan reset.

```bash
npm test
npm run test:e2e
```

Tes integrasi repository membutuhkan `TEST_DATABASE_URL` (direct/unpooled, terisolasi dari production-demo).
