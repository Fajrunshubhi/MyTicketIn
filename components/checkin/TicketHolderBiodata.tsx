export type TicketHolder = {
  fullName?: string;
  email?: string;
  phone?: string;
  identityNumber?: string;
  ownerName?: string;
};

export function TicketHolderBiodata({ holder }: { holder?: TicketHolder | null }) {
  if (!holder || !(holder.fullName || holder.email || holder.phone || holder.identityNumber || holder.ownerName)) {
    return <p className="mt-2 text-sm text-ink/60">Biodata pemegang tidak tersedia.</p>;
  }
  const rows = [
    { label: "Nama pemegang", value: holder.fullName },
    { label: "Email", value: holder.email },
    { label: "Telepon", value: holder.phone },
    { label: "NIK", value: holder.identityNumber },
  ].filter((row) => row.value);
  return (
    <dl className="mt-3 grid gap-1 text-sm text-ink/80">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 gap-2">
          <dt className="w-32 shrink-0 text-ink/50">{row.label}</dt>
          <dd className="min-w-0 break-all font-medium">{row.value}</dd>
        </div>
      ))}
      {holder.ownerName && holder.ownerName !== holder.fullName ? (
        <div className="flex min-w-0 gap-2">
          <dt className="w-32 shrink-0 text-ink/50">Pembeli akun</dt>
          <dd className="min-w-0 break-all font-medium">{holder.ownerName}</dd>
        </div>
      ) : null}
    </dl>
  );
}
