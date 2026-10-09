import { formatDateTime } from "@/lib/format";

export type OrganizerHistoryEntry = {
  id: string;
  occurredAt: string;
  actor: "OWNER" | "ADMIN";
  type:
    | "SUBMITTED"
    | "EDITED"
    | "RESUBMITTED"
    | "APPROVED"
    | "REJECTED"
    | "SUSPENDED"
    | "RESTORED"
    | "APPEALED"
    | "APPEAL_DISMISSED"
    | "REVOKED"
    | "CHANGE_REQUESTED"
    | "CHANGE_APPROVED"
    | "CHANGE_REJECTED"
    | "CHANGE_CANCELLED";
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
};

const TYPE_LABEL: Record<OrganizerHistoryEntry["type"], string> = {
  SUBMITTED: "Pengajuan dikirim",
  EDITED: "Data diperbarui",
  RESUBMITTED: "Diajukan ulang",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  SUSPENDED: "Ditangguhkan",
  RESTORED: "Dipulihkan",
  APPEALED: "Sanggahan dikirim",
  APPEAL_DISMISSED: "Sanggahan tidak diterima",
  REVOKED: "Akses penyelenggara dicabut",
  CHANGE_REQUESTED: "Perubahan data diajukan",
  CHANGE_APPROVED: "Perubahan data disetujui",
  CHANGE_REJECTED: "Perubahan data ditolak",
  CHANGE_CANCELLED: "Perubahan data dibatalkan",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu tinjauan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  SUSPENDED: "Ditangguhkan",
};

function tone(type: OrganizerHistoryEntry["type"]): string {
  if (type === "APPROVED" || type === "RESTORED" || type === "CHANGE_APPROVED") return "bg-emerald-50 text-emerald-800";
  if (type === "REJECTED" || type === "SUSPENDED" || type === "APPEAL_DISMISSED" || type === "REVOKED" || type === "CHANGE_REJECTED") return "bg-red-50 text-red-800";
  if (type === "APPEALED" || type === "RESUBMITTED" || type === "CHANGE_REQUESTED") return "bg-amber-50 text-amber-900";
  return "bg-[#eee8ff] text-gold-800";
}

export function OrganizerHistory({
  items,
  viewer,
}: {
  items: OrganizerHistoryEntry[];
  viewer: "owner" | "admin";
}) {
  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-semibold text-ink">Riwayat</h3>
        <p className="mt-2 text-sm text-ink/55">Belum ada jejak. Keputusan berikutnya akan tercatat di sini.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <h3 className="text-base font-semibold text-ink">Riwayat</h3>
      <p className="mt-1 text-sm text-ink/55">Jejak pengajuan, keputusan admin, dan sanggahan — dari yang terbaru.</p>
      <ol className="mt-4 space-y-0">
        {items.map((item, index) => (
          <li key={item.id} className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
            {index < items.length - 1 ? <span className="absolute bottom-0 left-[0.35rem] top-5 w-px bg-stone-200" aria-hidden /> : null}
            <span className={`mt-1 h-3 w-3 rounded-full ${tone(item.type)} ring-4 ring-white`} aria-hidden />
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{TYPE_LABEL[item.type] || item.type}</p>
                <time className="text-xs text-ink/45" dateTime={item.occurredAt}>
                  {formatDateTime(item.occurredAt)}
                </time>
              </div>
              <p className="mt-0.5 text-xs text-ink/50">
                {item.actor === "ADMIN" ? "Admin" : viewer === "owner" ? "Anda" : "Pemilik"}
                {item.fromStatus && item.toStatus && item.fromStatus !== item.toStatus
                  ? ` · ${STATUS_LABEL[item.fromStatus] || item.fromStatus} → ${STATUS_LABEL[item.toStatus] || item.toStatus}`
                  : null}
              </p>
              {item.note ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{item.note}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
