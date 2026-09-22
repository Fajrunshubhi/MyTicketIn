"use client";

import { formatDateTime } from "@/lib/format";
import { maskActor, outcomeLabel } from "@/components/audit/AuditLogList";

type Detail = {
  id: string;
  occurredAt: string;
  actorType: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome: "SUCCESS" | "REJECTED" | "FAILED";
  reasonCode?: string | null;
  correlationId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

function flatten(prefix: string, value: unknown, out: { key: string; value: string }[]) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(prefix ? `${prefix}.${k}` : k, v, out);
    }
    return;
  }
  out.push({ key: prefix, value: value == null ? "—" : String(value) });
}

function diffRows(before?: Record<string, unknown> | null, after?: Record<string, unknown> | null) {
  const left: { key: string; value: string }[] = [];
  const right: { key: string; value: string }[] = [];
  flatten("", before || {}, left);
  flatten("", after || {}, right);
  const keys = Array.from(new Set([...left.map((r) => r.key), ...right.map((r) => r.key)])).sort();
  const leftMap = Object.fromEntries(left.map((r) => [r.key, r.value]));
  const rightMap = Object.fromEntries(right.map((r) => [r.key, r.value]));
  return keys.map((key) => ({
    key,
    before: leftMap[key] ?? "—",
    after: rightMap[key] ?? "—",
  }));
}

export function AuditLogDetail({ detail }: { detail: Detail }) {
  const outcome = outcomeLabel(detail.outcome);
  const rows = diffRows(detail.before, detail.after);
  return (
    <article className="min-w-0 space-y-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-ink/50">Waktu</dt>
          <dd>
            <time dateTime={detail.occurredAt}>{formatDateTime(detail.occurredAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink/50">Aktor</dt>
          <dd>
            {detail.actorType} {maskActor(detail.actorUserId)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink/50">Aksi</dt>
          <dd>{detail.action}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink/50">Entitas</dt>
          <dd>
            {detail.entityType} {maskActor(detail.entityId)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink/50">Hasil</dt>
          <dd>
            <span aria-label={outcome.text}>
              {outcome.icon} {outcome.text}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink/50">Alasan</dt>
          <dd>{detail.reasonCode || "—"}</dd>
        </div>
      </dl>
      <section>
        <h2 className="text-lg font-semibold">Perubahan (hanya baca)</h2>
        {rows.length === 0 ? (
          <p>Tidak ada data before/after.</p>
        ) : (
          <table className="mt-3 w-full min-w-0 border-collapse text-left text-sm">
            <caption className="sr-only">Perbedaan before dan after</caption>
            <thead>
              <tr className="border-b border-stone-200">
                <th scope="col" className="py-2 pr-3">
                  Field
                </th>
                <th scope="col" className="py-2 pr-3">
                  Sebelum
                </th>
                <th scope="col" className="py-2">
                  Sesudah
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-stone-200">
                  <td className="py-2 pr-3">{row.key}</td>
                  <td className="py-2 pr-3">{row.before}</td>
                  <td className="py-2">{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </article>
  );
}
