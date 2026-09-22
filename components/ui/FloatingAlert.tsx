"use client";

import { useEffect } from "react";
import { Alert } from "@/components/ui/Alert";

export type FloatingAlertTone = "success" | "error" | "info";

export function FloatingAlert({
  tone,
  title,
  children,
  onClose,
  autoHideMs = 6000,
  anchored = true,
}: {
  tone: FloatingAlertTone;
  title: string;
  children?: string;
  onClose: () => void;
  autoHideMs?: number;
  anchored?: boolean;
}) {
  useEffect(() => {
    if (!autoHideMs) return;
    const id = window.setTimeout(onClose, autoHideMs);
    return () => window.clearTimeout(id);
  }, [autoHideMs, onClose, title, children, tone]);

  return (
    <div className={anchored ? "pointer-events-auto fixed bottom-4 right-4 z-[90] w-[min(24rem,calc(100vw-1.5rem))] shadow-lg" : "pointer-events-auto w-full shadow-lg"}>
      <Alert tone={tone} title={title}>
        {children ? <p>{children}</p> : null}
        <button type="button" className="mt-2 text-sm underline underline-offset-2" onClick={onClose}>
          Tutup
        </button>
      </Alert>
    </div>
  );
}
