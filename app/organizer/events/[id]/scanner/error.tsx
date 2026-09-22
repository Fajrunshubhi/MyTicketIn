"use client";

import { ErrorState } from "@/components/shared/ErrorState";

export default function ScannerError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="p-6">
      <ErrorState
        title="Scanner gagal dimuat"
        recovery="Izinkan kamera, atau gunakan input manual bila tersedia. Jaringan terputus tidak menandai tiket Used."
        onRetry={reset}
      />
    </main>
  );
}
