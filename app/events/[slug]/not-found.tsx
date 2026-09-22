import Link from "next/link";

export default function EventNotFound() {
  return (
    <main className="auth-shell min-h-screen p-6">
      <h1 className="font-display text-2xl text-ink">Event tidak ditemukan</h1>
      <p className="mt-2 text-ink/70">Event mungkin belum dipublikasikan atau sudah berakhir.</p>
      <Link href="/events" className="mt-4 inline-block text-gold-700 underline">Kembali ke katalog</Link>
    </main>
  );
}
