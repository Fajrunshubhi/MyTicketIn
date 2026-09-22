"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";

export default function LogoutButton({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await apiFetch("/api/auth/signout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void logout()}
      aria-label="Keluar"
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100 ${className}`}
    >
      <Icon name="logout" />
      {compact ? <span className="sr-only">Keluar</span> : "Keluar"}
    </button>
  );
}
