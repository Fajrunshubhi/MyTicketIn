"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatDateTime, formatRupiah } from "@/lib/format";

type Health = {
  status?: string;
  checks?: { app?: string; database?: string };
  correlationId?: string;
  error?: { message?: string };
};

type Meta = {
  locale?: string;
  currency?: string;
  environment?: string;
  version?: string;
};

type View = "loading" | "ok" | "error" | "offline";

export function PlatformStatus({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [view, setView] = useState<View>("loading");
  const [health, setHealth] = useState<Health | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const sampleTime = formatDateTime("2026-01-01T00:00:00.000Z");
  const sampleMoney = formatRupiah(125000);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setView("offline");
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const [healthRes, liveRes, metaRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/health/ready`, { cache: "no-store" }),
          fetch(`${apiBaseUrl}/api/health/live`, { cache: "no-store" }),
          fetch(`${apiBaseUrl}/api/meta`, { cache: "no-store" }),
        ]);
        const healthJson = (await healthRes.json()) as Health;
        const metaJson = (await metaRes.json()) as Meta;
        if (cancelled) return;
        setHealth(healthJson);
        setMeta(metaJson);
        setView(healthRes.ok && liveRes.ok ? "ok" : "error");
      } catch {
        if (!cancelled) setView(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  if (view === "loading") {
    return <LoadingState label="Memeriksa status layanan…" />;
  }
  if (view === "offline") {
    return (
      <Alert tone="error" title="Anda sedang offline">
        Periksa koneksi, lalu muat ulang halaman.
      </Alert>
    );
  }
  if (view === "error") {
    return (
      <Alert tone="error" title="API belum siap">
        {health?.error?.message || "Tidak dapat menghubungi API Next.js. Pastikan aplikasi berjalan dan DATABASE_URL tersedia."}
      </Alert>
    );
  }

  const envLabel = meta?.environment === "production-demo" ? "SANDBOX" : "UJI";

  return (
    <Alert tone="success" title="Layanan fondasi siap">
      <p>
        Lingkungan: {meta?.environment} ({envLabel}). Locale {meta?.locale}, {meta?.currency}.
      </p>
      <p>
        Contoh harga: {sampleMoney}. Contoh waktu UTC ke zona default: {sampleTime}.
      </p>
      <p>Korelasi: {health?.correlationId}</p>
    </Alert>
  );
}
