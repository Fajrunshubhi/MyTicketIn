"use client";

import { ErrorState } from "@/components/shared/ErrorState";

export default function EventsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="auth-shell min-h-screen p-6">
      <h1 className="font-display text-2xl text-ink">Katalog tidak dapat dimuat</h1>
      <div className="mt-4 max-w-lg">
        <ErrorState
          title="Katalog gagal dimuat"
          recovery="Ini bukan masalah kuota tiket. Muat ulang atau kembali ke daftar event."
          onRetry={reset}
        />
      </div>
    </main>
  );
}
