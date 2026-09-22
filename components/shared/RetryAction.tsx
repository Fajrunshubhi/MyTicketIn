"use client";

import { Button } from "@/components/ui/Button";

export function RetryAction({ onClick, label = "Coba lagi" }: { onClick: () => void; label?: string }) {
  return (
    <Button type="button" onClick={onClick}>
      {label}
    </Button>
  );
}
