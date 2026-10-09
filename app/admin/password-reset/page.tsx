"use client";

import { FormEvent, useState } from "react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { apiFetch, readApiError } from "@/lib/api";

export default function AdminPasswordAssistPage() {
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setToken("");
    setMessage("");
    setLoading(true);
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId.trim())}/password-reset-assistance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(readApiError(body, "Bantuan pemulihan gagal."));
      return;
    }
    setMessage(String(body.data?.message || "Pemulihan disiapkan."));
    // Present only when no email provider is configured; otherwise the link goes to the user's email.
    setToken(body.data?.oneTimeToken || "");
    setReason("");
  }

  return (
    <div>
      <Container>
        <h1 className="font-display mt-2 text-3xl text-ink">Bantuan reset kata sandi</h1>
        <p className="mt-2 max-w-lg text-sm text-ink/65">
          Tautan pemulihan dikirim ke email akun pengguna dan berlaku 30 menit. Admin tidak melihat tautan atau kata sandi.
        </p>
        <form onSubmit={onSubmit} className="mt-6 max-w-lg space-y-3">
          <label className="block text-sm">
            Username, email, atau ID pengguna
            <input
              className="mt-1 w-full rounded bg-white p-2"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            Alasan (10–1000 karakter)
            <textarea
              className="mt-1 w-full rounded bg-white p-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={10}
              maxLength={1000}
            />
          </label>
          {error ? (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          ) : null}
          {message ? (
            <p role="status" className="text-emerald-800">
              {message}
            </p>
          ) : null}
          {token ? (
            <p role="status" className="break-all text-sm">
              Token sekali pakai (mode sandbox, tanpa email): {token}
            </p>
          ) : null}
          <Button type="submit" loading={loading} disabled={loading}>
            Kirim tautan pemulihan
          </Button>
        </form>
      </Container>
    </div>
  );
}
