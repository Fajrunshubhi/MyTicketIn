"use client";

import { Icon, type IconName } from "@/components/ui/Icon";

export type AuthPortal = "buyer" | "organizer" | "admin" | "staff";

const options: { id: AuthPortal; title: string; hint: string; admin?: boolean }[] = [
  {
    id: "buyer",
    title: "Pembeli tiket",
    hint: "Masuk untuk membeli tiket. Ajukan menjadi penyelenggara dari dalam aplikasi.",
  },
  {
    id: "organizer",
    title: "Penyelenggara event",
    hint: "Hanya untuk penyelenggara yang sudah disetujui admin.",
  },
  {
    id: "staff",
    title: "Petugas check-in",
    hint: "Hanya login. Pilih penyelenggara lalu username petugas yang dibuat penyelenggara.",
  },
  {
    id: "admin",
    title: "Admin aplikasi",
    hint: "Moderasi organizer dan event. Bukan pendaftaran publik.",
    admin: true,
  },
];

const portalIcon: Record<AuthPortal, IconName> = {
  buyer: "ticket",
  organizer: "building",
  admin: "shield",
  staff: "devices",
};

type Props = {
  value: AuthPortal;
  onChange: (value: AuthPortal) => void;
  includeAdmin?: boolean;
  includeOrganizer?: boolean;
  legend: string;
  name: string;
};

export function PortalChoice({ value, onChange, includeAdmin, includeOrganizer = true, legend, name }: Props) {
  const visible = options.filter((item) => {
    if (item.admin) {
      return Boolean(includeAdmin);
    }
    if (item.id === "organizer") {
      return includeOrganizer;
    }
    return true;
  });
  const selectedHint = visible.find((item) => item.id === value)?.hint;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm text-ink/70">{legend}</legend>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {visible.map((item) => {
          const id = `${name}-${item.id}`;
          const selected = value === item.id;
          return (
            <label
              key={item.id}
              htmlFor={id}
              className={`flex min-h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-center text-[11px] font-medium leading-tight sm:text-xs ${
                selected ? "border-gold-400 bg-gold-500/10 text-ink" : "border-stone-200 bg-white text-ink/80"
              }`}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={item.id}
                checked={selected}
                onChange={() => onChange(item.id)}
                className="sr-only"
              />
              <Icon name={portalIcon[item.id]} className="h-3.5 w-3.5" />
              {item.title}
            </label>
          );
        })}
      </div>
      {selectedHint ? <p className="mt-1.5 text-xs leading-snug text-ink/55">{selectedHint}</p> : null}
    </fieldset>
  );
}

export function googleCallbackForPortal(portal: AuthPortal): string {
  if (portal === "admin") return "/dashboard";
  if (portal === "staff") return "/petugas";
  return "/";
}
