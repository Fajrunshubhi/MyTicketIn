"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CheckoutRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    const raw = sessionStorage.getItem("mti_checkout");
    if (!raw) {
      router.replace("/events");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { slug?: string };
      if (parsed.slug) {
        router.replace(`/events/${parsed.slug}/checkout`);
        return;
      }
    } catch {
      sessionStorage.removeItem("mti_checkout");
    }
    router.replace("/events");
  }, [router]);
  return <p className="p-6 text-ink/70">Membuka checkout…</p>;
}
