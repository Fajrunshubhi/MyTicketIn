import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL || "";

  if (!/^(postgres|postgresql):\/\//i.test(url)) {
    console.error("DATABASE_URL belum diisi atau bukan PostgreSQL.");
    process.exit(1);
  }

  const sql = neon(url);
  await sql`SELECT 1 AS ok`;
  console.log("Koneksi PostgreSQL berhasil. Skema hanya dibentuk oleh goose, bukan skrip ini.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Gagal terhubung ke database.");
  process.exit(1);
});
