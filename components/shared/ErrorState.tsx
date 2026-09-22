"use client";

import { RetryAction } from "@/components/shared/RetryAction";

export function ErrorState({
  title,
  recovery,
  correlationId,
  onRetry,
}: {
  title: string;
  recovery: string;
  correlationId?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-950">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-90">{recovery}</p>
      {correlationId ? (
        <p className="mt-2 text-xs text-ink/55">
          ID korelasi: <span className="font-mono">{correlationId}</span>
        </p>
      ) : null}
      {onRetry ? <div className="mt-3"><RetryAction onClick={onRetry} /></div> : null}
    </div>
  );
}
