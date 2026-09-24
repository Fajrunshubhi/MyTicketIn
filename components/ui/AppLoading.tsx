"use client";

import { useEffect, useState, type ReactNode } from "react";
import { installFetchLoadingGuard, subscribeLoading } from "@/lib/loading";

function Spinner({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-gold-200 border-t-gold-600 ${className}`}
      aria-hidden
    />
  );
}

export function LoadingAlert() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex min-w-[16rem] flex-col items-center gap-3 rounded-2xl bg-white px-8 py-7 shadow-lg">
        <Spinner />
        <p className="text-sm font-semibold text-ink">Memuat data…</p>
        <p className="text-xs text-ink/60">Mohon tunggu sebentar.</p>
      </div>
    </div>
  );
}

export function AppLoadingProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => subscribeLoading(setVisible), []);
  useEffect(() => installFetchLoadingGuard(), []);
  return (
    <>
      {children}
      {visible ? <LoadingAlert /> : null}
    </>
  );
}

/** Pakai di fallback Suspense / loading.tsx agar overlay yang sama muncul. */
export function RouteLoading() {
  return <LoadingAlert />;
}

export function ButtonSpinner() {
  return <Spinner className="h-4 w-4 border-white/35 border-t-white" />;
}
