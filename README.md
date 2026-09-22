# MyTicketIn — Login Prototipe + fondasi Go

Prototype UI saat ini masih **Next.js 14 + TypeScript**. Runtime transaksi target adalah **Go 1.27** (API) dengan PostgreSQL/Neon. Jangan anggap login prototype sebagai produk selesai.

## Stack target (RFC-001)

- API: `backend/cmd/api` (Go, chi, pgx, goose, sqlc)
- UI: Next.js tipis yang memanggil `NEXT_PUBLIC_API_BASE_URL`
- Database: PostgreSQL (lokal untuk development; Neon untuk deployment)

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
cd backend
go run ./cmd/migrate
go run ./cmd/api
```

Jika memakai PostgreSQL Windows (bukan Docker), buat database `myticketin` lalu ganti user/password pada URL, tetap `127.0.0.1:5432` dan `sslmode=disable`.

### Deployment (nanti)

Di hosting, isi URL Neon: pooled → `DATABASE_URL`, direct (tanpa `-pooler`) → `DATABASE_URL_UNPOOLED`, `sslmode=require`. Jangan memakai localhost.

## 2. Environment

Salin `.env.example` ke `.env.local`. Isi secret; **jangan** commit `.env.local`. Simpan URL Neon di catatan terpisah agar tinggal ditukar saat deploy.

## 3. Menjalankan UI dan API (RFC-001)

Pasang [Go 1.27.1](https://go.dev/dl/). Auth memakai sesi opaque Go (bukan NextAuth).

```bash
npm install
cd backend
go mod download
go run ./cmd/migrate
go run ./cmd/api
```

Di terminal lain:

```bash
npm run dev
```

- UI: `http://localhost:3000` (rewrite `/api/*` ke proses Go)
- Health: `GET http://localhost:8080/api/health`
- Register/login: `POST /api/register` (hanya pembeli), `POST /api/auth/login` dengan `portal` (`buyer` \| `organizer` \| `admin`) + CSRF + cookie `mti_session`. Portal yang tidak cocok ditolak `AUTH_PORTAL_DENIED`.
- Google: isi `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` berpasangan; tombol disembunyikan jika kosong

Migrasi `0002_identity_session_rbac` bersifat additive pada tabel `users` RFC-001. Jalankan goose pada cabang/database uji sebelum production-demo.

`npm run db-check` hanya `SELECT 1`. Skema dibuat **hanya** oleh goose (`backend/migrations`), bukan request path.

Strategi data RFC-001: **reset/tabel kosong**. Akun prototype tidak di-backfill. Jangan jalankan goose `0001` pada database yang sudah punya tabel `users` berbeda tanpa keputusan reset.

```bash
cd backend && go test ./...
npm test
npm run test:e2e
```

Tes integrasi repository membutuhkan `TEST_DATABASE_URL` (direct/unpooled, terisolasi dari production-demo).
