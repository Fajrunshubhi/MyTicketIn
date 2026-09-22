"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent } from "react";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export type AuditSummary = {
  id: string;
  occurredAt: string;
  actorType: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome: "SUCCESS" | "REJECTED" | "FAILED";
  reasonCode?: string | null;
};

export function maskActor(id?: string | null): string {
  if (!id) {
    return "—";
  }
  if (id.length <= 8) {
    return "••••";
  }
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function outcomeLabel(outcome: AuditSummary["outcome"]): { text: string; icon: string } {
  if (outcome === "SUCCESS") {
    return { text: "Berhasil", icon: "✓" };
  }
  if (outcome === "REJECTED") {
    return { text: "Ditolak", icon: "✕" };
  }
  return { text: "Gagal", icon: "!" };
}

export function AuditLogList({
  rows,
  nextCursor,
  filters,
}: {
  rows: AuditSummary[];
  nextCursor: string;
  filters: Record<string, string>;
}) {
  const router = useRouter();

  function onFilter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["action", "entityType", "entityId", "actorUserId", "outcome", "from", "to"]) {
      const value = String(data.get(key) || "").trim();
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `/admin/audit?${qs}` : "/admin/audit");
  }

  return (
    <div className="min-w-0">
      <form onSubmit={onFilter} className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
        <Input label="Aksi" name="action" defaultValue={filters.action} />
        <Input label="Tipe entitas" name="entityType" defaultValue={filters.entityType} />
        <Input label="ID entitas" name="entityId" defaultValue={filters.entityId} />
        <Input label="ID aktor" name="actorUserId" defaultValue={filters.actorUserId} />
        <div className="min-w-0">
          <label htmlFor="outcome" className="mb-1 block text-sm font-medium">
            Hasil
          </label>
          <select
            id="outcome"
            name="outcome"
            defaultValue={filters.outcome}
            className="min-h-11 w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 text-sm"
          >
            <option value="">Semua</option>
            <option value="SUCCESS">Berhasil</option>
            <option value="REJECTED">Ditolak</option>
            <option value="FAILED">Gagal</option>
          </select>
        </div>
        <Input label="Dari (ISO)" name="from" defaultValue={filters.from} />
        <Input label="Sampai (ISO)" name="to" defaultValue={filters.to} />
        <div className="flex items-end">
          <Button type="submit">Terapkan filter</Button>
        </div>
      </form>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <caption className="sr-only">Daftar jejak audit</caption>
          <thead>
            <tr className="border-b border-stone-200">
              <th scope="col" className="py-2 pr-3">
                Waktu
              </th>
              <th scope="col" className="py-2 pr-3">
                Aktor
              </th>
              <th scope="col" className="py-2 pr-3">
                Aksi
              </th>
              <th scope="col" className="py-2 pr-3">
                Entitas
              </th>
              <th scope="col" className="py-2 pr-3">
                Hasil
              </th>
              <th scope="col" className="py-2">
                Alasan
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const outcome = outcomeLabel(row.outcome);
              return (
                <tr key={row.id} className="border-b border-stone-200">
                  <td className="py-3 pr-3">
                    <Link className="underline-offset-2 hover:underline" href={`/admin/audit/${row.id}`}>
                      <time dateTime={row.occurredAt}>{formatDateTime(row.occurredAt)}</time>
                    </Link>
                  </td>
                  <td className="py-3 pr-3">
                    {row.actorType} {maskActor(row.actorUserId)}
                  </td>
                  <td className="py-3 pr-3">{row.action}</td>
                  <td className="py-3 pr-3">
                    {row.entityType}
                    {row.entityId ? ` ${maskActor(row.entityId)}` : ""}
                  </td>
                  <td className="py-3 pr-3">
                    <span aria-label={outcome.text}>
                      {outcome.icon} {outcome.text}
                    </span>
                  </td>
                  <td className="py-3">{row.reasonCode || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {nextCursor ? (
        <p className="mt-4">
          <Link
            className="text-gold-700 underline-offset-2 hover:underline"
            href={`/admin/audit?${new URLSearchParams({ ...filters, cursor: nextCursor }).toString()}`}
          >
            Halaman berikutnya
          </Link>
        </p>
      ) : null}
    </div>
  );
}
