"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

type Props = {
  callbackUrl?: string;
  portal?: string;
};

export default function GoogleButton({ callbackUrl, portal }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/providers", { credentials: "include", cache: "no-store" })
      .then((res) => res.json())
      .then((data: { google?: boolean }) => {
        if (!cancelled) setEnabled(Boolean(data.google));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) {
    return null;
  }

  function handleGoogle() {
    setLoading(true);
    const fallback = portal === "admin" ? "/dashboard" : "/";
    const next = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : fallback;
    const chosen = portal === "organizer" || portal === "admin" || portal === "buyer" ? portal : "buyer";
    window.location.assign(
      `/api/auth/signin/google?callbackUrl=${encodeURIComponent(next)}&portal=${encodeURIComponent(chosen)}`
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        aria-label="Masuk dengan Gmail"
        className="flex h-11 min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          "Menghubungkan Gmail..."
        ) : (
          <>
            <Icon name="google" className="h-5 w-5" />
            Masuk dengan Gmail
          </>
        )}
      </button>
    </div>
  );
}
