import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

type Tone = "info" | "error" | "success";

const toneClass: Record<Tone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-950",
  error: "border-red-200 bg-red-50 text-red-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
};

const toneIcon: Record<Tone, IconName> = {
  info: "info",
  error: "error",
  success: "success",
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex min-w-0 gap-3 rounded-2xl border px-4 py-3 ${toneClass[tone]}`}
    >
      <Icon name={toneIcon[tone]} className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 text-sm opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}
