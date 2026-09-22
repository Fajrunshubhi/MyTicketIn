"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { apiFetch, readApiError, type ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

type Props = {
  initial?: {
    name: string;
    contactEmail: string;
    contactPhone?: string | null;
    description: string;
    version: number;
  };
  mode: "create" | "edit";
  onDone: () => void;
};

export function ApplicationForm({ initial, mode, onDone }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setLoading(true);
    const path = mode === "create" ? "/api/organizer/applications" : "/api/organizer/application";
    const method = mode === "create" ? "POST" : "PATCH";
    const body: Record<string, unknown> = {
      name,
      contactEmail,
      contactPhone: contactPhone.trim() ? contactPhone.trim() : null,
      description,
    };
    if (mode === "edit" && initial) {
      body.expectedVersion = initial.version;
    }
    const res = await apiFetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as ApiError;
    setLoading(false);
    if (!res.ok) {
      setFieldErrors(payload.error?.fieldErrors || {});
      setError(readApiError(payload, "Pengajuan gagal."));
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-4">
      {error ? <Alert tone="error" title="Tidak dapat menyimpan">{error}</Alert> : null}
      <Input label="Nama organizer" name="name" value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors.name} required />
      <Input
        label="Email kontak"
        name="contactEmail"
        type="email"
        value={contactEmail}
        onChange={(e) => setContactEmail(e.target.value)}
        error={fieldErrors.contactEmail}
        required
      />
      <Input
        label="Telepon (opsional)"
        name="contactPhone"
        value={contactPhone}
        onChange={(e) => setContactPhone(e.target.value)}
        error={fieldErrors.contactPhone}
      />
      <div className="min-w-0">
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          Deskripsi
        </label>
        <textarea
          id="description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={Boolean(fieldErrors.description)}
          className="min-h-32 w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          required
        />
        {fieldErrors.description ? (
          <p className="mt-1 text-sm text-red-700" role="alert">
            {fieldErrors.description}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={loading}>
        {mode === "create" ? "Kirim pengajuan" : "Simpan perubahan"}
      </Button>
    </form>
  );
}
