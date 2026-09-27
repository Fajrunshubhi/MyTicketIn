"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export const ORGANIZER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu tinjauan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  SUSPENDED: "Ditangguhkan",
};

export function reviewStatusClass(status: string): string {
  if (status === "PENDING" || status === "PENDING_REVIEW") {
    return "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200";
  }
  if (status === "APPROVED" || status === "PUBLISHED") {
    return "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200";
  }
  if (status === "REJECTED") {
    return "bg-red-50 text-red-800 ring-1 ring-inset ring-red-200";
  }
  if (status === "SUSPENDED" || status === "CANCELLED") {
    return "bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-300";
  }
  return "bg-stone-100 text-ink/70 ring-1 ring-inset ring-stone-200";
}

export function ReviewStatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${reviewStatusClass(status)}`}>
      {label}
    </span>
  );
}

export function ReviewBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center text-sm font-medium text-gold-700 underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

export function ReviewField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">{label}</p>
      <div className="mt-1 break-words text-sm text-ink">{children}</div>
    </div>
  );
}

export type DecisionOption = {
  id: string;
  label: string;
  hint: string;
};

export function DecisionChoice({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: DecisionOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink">Keputusan</legend>
      <div className="grid gap-2">
        {options.map((option) => {
          const selected = value === option.id;
          const reject = option.id === "REJECT" || option.id === "SUSPEND";
          return (
            <label
              key={option.id}
              className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 ${
                selected
                  ? reject
                    ? "border-red-300 bg-red-50"
                    : "border-gold-400 bg-gold-50"
                  : "border-stone-200 bg-white hover:border-stone-300"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={selected}
                onChange={() => onChange(option.id)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">{option.label}</span>
                <span className="mt-0.5 block text-xs text-ink/55">{option.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function DecisionReasonField({
  id,
  value,
  onChange,
  hint,
  label = "Alasan keputusan",
  required = true,
  minLength = 10,
  maxLength = 1000,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  label?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  const count = [...value].length;
  const short = required && count > 0 && count < minLength;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <span className={`text-xs tabular-nums ${short ? "text-red-700" : "text-ink/45"}`}>
          {count}/{maxLength}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={required ? minLength : undefined}
        maxLength={maxLength}
        rows={4}
        className="min-h-24 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
      />
      <p className="mt-1 text-xs text-ink/55">{hint}</p>
    </div>
  );
}

export function ReviewDecisionCard({
  title,
  description,
  onSubmit,
  submitting,
  submitLabel,
  submitVariant = "primary",
  disabled,
  children,
}: {
  title: string;
  description: string;
  onSubmit: (e: FormEvent) => void;
  submitting?: boolean;
  submitLabel: string;
  submitVariant?: "primary" | "danger";
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <header className="mb-4 border-b border-stone-100 pb-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink/60">{description}</p>
      </header>
      <div className="space-y-4">{children}</div>
      <Button type="submit" className="mt-5 w-full" loading={submitting} disabled={disabled} variant={submitVariant}>
        {submitLabel}
      </Button>
    </form>
  );
}
