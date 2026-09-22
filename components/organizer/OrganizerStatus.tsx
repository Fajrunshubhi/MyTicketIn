"use client";

import { useState } from "react";
import { apiFetch, readApiError } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";
import { ApplicationForm } from "@/components/organizer/ApplicationForm";

export type OrganizerProfile = {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone?: string | null;
  description: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  decisionReason?: string | null;
  submittedAt: string;
  version: number;
};

const statusCopy: Record<OrganizerProfile["status"], { icon: string; text: string; hint: string }> = {
  PENDING: { icon: "…", text: "Sedang ditinjau", hint: "Admin belum mengambil keputusan. Capability organizer belum aktif." },
  APPROVED: { icon: "✓", text: "Disetujui", hint: "Capability organizer aktif. Anda dapat menulis draf event." },
  REJECTED: { icon: "✕", text: "Ditolak", hint: "Perbarui data lalu ajukan ulang." },
  SUSPENDED: { icon: "!", text: "Ditangguhkan", hint: "Aksi organizer baru ditahan. Data historis tetap ada." },
};

export function OrganizerStatus({ profile, onRefresh }: { profile: OrganizerProfile; onRefresh: () => void }) {
  const copy = statusCopy[profile.status];
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function resubmit() {
    setError("");
    setLoading(true);
    const res = await apiFetch("/api/organizer/application/resubmit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: profile.version }),
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(readApiError(payload, "Pengajuan ulang gagal."));
      return;
    }
    onRefresh();
  }

  return (
    <section className="space-y-6">
      <p>
        <span aria-label={copy.text}>
          {copy.icon} {copy.text}
        </span>
      </p>
      <p className="text-ink/70">{copy.hint}</p>
      <p className="text-sm text-ink/50">
        Diajukan <time dateTime={profile.submittedAt}>{formatDateTime(profile.submittedAt)}</time>
      </p>
      {profile.decisionReason ? (
        <Alert tone="info" title="Alasan admin">
          {profile.decisionReason}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error" title="Gagal">
          {error}
        </Alert>
      ) : null}
      {profile.status === "APPROVED" ? (
        <p>
          <a className="text-gold-700 underline-offset-2 hover:underline" href="/organizer/events">
            Buka workspace event
          </a>
        </p>
      ) : null}
      {profile.status === "REJECTED" ? (
        <div className="space-y-6">
          <ApplicationForm
            mode="edit"
            initial={{
              name: profile.name,
              contactEmail: profile.contactEmail,
              contactPhone: profile.contactPhone,
              description: profile.description,
              version: profile.version,
            }}
            onDone={onRefresh}
          />
          <Button type="button" disabled={loading} onClick={resubmit}>
            Ajukan ulang
          </Button>
        </div>
      ) : null}
    </section>
  );
}
