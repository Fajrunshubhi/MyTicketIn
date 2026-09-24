"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FormFieldWide, FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { apiFetch, readApiError } from "@/lib/api";

type Account = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  status: string;
  version: number;
};

export default function OrganizerStaffAccountsPage() {
  const [items, setItems] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUser, setEditUser] = useState("");
  const [editPass, setEditPass] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await apiFetch("/api/organizer/staff-accounts");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Gagal memuat akun petugas."));
      return;
    }
    setItems((body.data?.items || []) as Account[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await apiFetch("/api/organizer/staff-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, username, password }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Gagal menambah petugas."));
      return;
    }
    setDisplayName("");
    setUsername("");
    setPassword("");
    await load();
  }

  async function onSave(item: Account) {
    setError("");
    setBusy(true);
    const res = await apiFetch(`/api/organizer/staff-accounts/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: editName,
        username: editUser,
        password: editPass || undefined,
        expectedVersion: item.version,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Gagal menyimpan petugas."));
      return;
    }
    setEditId(null);
    setEditPass("");
    await load();
  }

  async function onDelete(item: Account) {
    if (!window.confirm(`Hapus akun petugas ${item.username}? Petugas tidak dapat masuk lagi.`)) return;
    setError("");
    setBusy(true);
    const res = await apiFetch(`/api/organizer/staff-accounts/${item.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: item.version }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Gagal menghapus petugas."));
      return;
    }
    await load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl text-ink">Akun petugas</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/65">
          Buat username dan kata sandi khusus petugas. Bukan akun pembeli. Setelah itu tugaskan petugas ke event pada halaman event.
        </p>
      </div>
      {error ? <Alert tone="error" title="Tidak dapat diproses">{error}</Alert> : null}

      <form onSubmit={onCreate}>
        <FormSection title="Tambah petugas" description="Kata sandi minimal 10 karakter. Username unik per penyelenggara.">
          <Input label="Nama tampilan" name="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          <Input label="Username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" required />
          <Input label="Kata sandi" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          <FormFieldWide>
            <Button type="submit" loading={busy}>
              Tambah petugas
            </Button>
          </FormFieldWide>
        </FormSection>
      </form>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-ink">Daftar akun</h2>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-ink/60">Belum ada petugas.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-stone-200 p-4">
                {editId === item.id ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="Nama tampilan" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Input label="Username" value={editUser} onChange={(e) => setEditUser(e.target.value)} />
                    <Input label="Kata sandi baru (opsional)" type="password" value={editPass} onChange={(e) => setEditPass(e.target.value)} />
                    <div className="flex flex-wrap items-end gap-2">
                      <Button type="button" loading={busy} onClick={() => void onSave(item)}>
                        Simpan
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setEditId(null)}>
                        Batal
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{item.displayName}</p>
                      <p className="text-sm text-ink/60">
                        @{item.username} · {item.status === "ACTIVE" ? "Aktif" : "Dinonaktifkan"}
                      </p>
                    </div>
                    {item.status === "ACTIVE" ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setEditId(item.id);
                            setEditName(item.displayName);
                            setEditUser(item.username);
                            setEditPass("");
                          }}
                        >
                          Edit
                        </Button>
                        <Button type="button" variant="danger" loading={busy} onClick={() => void onDelete(item)}>
                          Hapus
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
