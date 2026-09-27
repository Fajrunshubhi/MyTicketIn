import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export function Input({ label, error, hint, id, className = "", ...props }: Props) {
  const fieldId = id ?? props.name;
  const errorId = error && fieldId ? `${fieldId}-error` : undefined;
  const hintId = hint && fieldId ? `${fieldId}-hint` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mb-1.5 text-xs text-ink/55">
          {hint}
        </p>
      ) : null}
      <input
        id={fieldId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`min-h-11 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 ${className}`}
        {...props}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
