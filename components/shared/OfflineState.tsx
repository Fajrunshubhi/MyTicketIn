"use client";

import { RetryAction } from "@/components/shared/RetryAction";

export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
      <p className="font-semibold">Anda sedang offline</p>
      <p className="mt-1 text-sm opacity-90">
        Periksa koneksi. Status tiket atau pembayaran tidak berubah di perangkat ini sampai jaringan pulih.
      </p>
      {onRetry ? <div className="mt-3"><RetryAction onClick={onRetry} /></div> : null}
    </div>
  );
}
