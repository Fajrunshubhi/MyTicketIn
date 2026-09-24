"use client";

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ButtonSpinner } from "@/components/ui/AppLoading";
import { beginLoading, endLoading } from "@/lib/loading";

type Variant = "primary" | "secondary" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  variant?: Variant;
};

const variants: Record<Variant, string> = {
  primary:
    "bg-gold-500 text-white hover:bg-gold-600 focus-visible:outline-gold-400 disabled:opacity-60",
  secondary:
    "border border-stone-300 bg-white text-ink hover:bg-stone-50 focus-visible:outline-gold-400 disabled:opacity-60",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-400 disabled:opacity-60",
};

export function Button({
  children,
  className = "",
  type = "button",
  loading = false,
  variant = "primary",
  disabled,
  ...props
}: Props) {
  const busy = Boolean(loading);
  useEffect(() => {
    if (!busy) return;
    beginLoading();
    return () => endLoading();
  }, [busy]);
  return (
    <button
      type={type}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${variants[variant]} ${className}`}
      {...props}
    >
      {busy ? <ButtonSpinner /> : null}
      <span>{busy ? "Memproses…" : children}</span>
    </button>
  );
}
