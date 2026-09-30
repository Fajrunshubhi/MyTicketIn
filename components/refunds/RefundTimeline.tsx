import type { RefundTimelineStep } from "@/lib/order-refund-display";

const STATE_CLASS: Record<RefundTimelineStep["state"], string> = {
  done: "border-emerald-500 bg-emerald-500",
  current: "border-gold-500 bg-gold-500",
  wait: "border-stone-300 bg-white",
  error: "border-red-500 bg-red-500",
};

export function RefundTimeline({ steps }: { steps: RefundTimelineStep[] }) {
  return (
    <ol className="mt-5 space-y-0" aria-label="Alur refund">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`mt-0.5 h-3.5 w-3.5 rounded-full border-2 ${STATE_CLASS[step.state]}`} aria-hidden />
              {last ? null : <span className="w-px flex-1 bg-stone-200" aria-hidden />}
            </div>
            <div className={`pb-4 ${last ? "pb-0" : ""}`}>
              <p className="text-sm font-semibold text-ink">{step.label}</p>
              {step.detail ? <p className="mt-0.5 text-xs text-ink/55">{step.detail}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
