"use client";

import { FormEvent, useState } from "react";
import { Container } from "@/components/ui/Container";
import { apiFetch, readApiError } from "@/lib/api";

export default function AdminPasswordAssistPage() {
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setToken("");
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/password-reset-assistance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Bantuan pemulihan gagal."));
      return;
    }
    setToken(body.data?.oneTimeToken || "");
  }

  return (
    <div>
      <Container>
        <p className="text-sm text-gold-800">SANDBOX · token tidak boleh dicatat di log</p>
        <h1 className="font-display mt-2 text-3xl text-ink">Bantuan reset kata sandi</h1>
        <form onSubmit={onSubmit} className="mt-6 max-w-lg space-y-3">
          <label className="block text-sm">ID pengguna
            <input className="mt-1 w-full rounded bg-white p-2" value={userId} onChange={(e) => setUserId(e.target.value)} required />
          </label>
          <label className="block text-sm">Alasan (10–1000 karakter)
            <textarea className="mt-1 w-full rounded bg-white p-2" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={10} />
          </label>
          {error ? <p role="alert" className="text-red-700">{error}</p> : null}
          {token ? <p role="status" className="break-all">Token sekali pakai: {token}</p> : null}
          <button type="submit" className="min-h-11 rounded-xl bg-gold-500 px-4 font-semibold text-ink">Siapkan pemulihan</button>
        </form>
      </Container>
    </div>
  );
}
