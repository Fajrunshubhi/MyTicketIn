"use client";

import { ErrorState } from "@/components/shared/ErrorState";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="auth-shell min-h-screen p-6">
      <ErrorState
        title="Halaman tidak dapat dimuat"
        recovery="Coba lagi. Jangan ulangi pembayaran sebelum status order terbarui dari server."
        onRetry={reset}
      />
    </main>
  );
}
