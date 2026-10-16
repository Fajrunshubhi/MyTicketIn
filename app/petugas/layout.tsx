import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import LogoutButton from "@/components/LogoutButton";
import BrandMark from "@/components/BrandMark";
import { LiveClock } from "@/components/LiveClock";
import { loadSessionUser } from "@/lib/session";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const user = await loadSessionUser();
  if (!user) {
    redirect("/login?portal=staff&callbackUrl=/petugas");
  }
  if (user.access?.kind !== "staff") {
    redirect("/");
  }
  return (
    <div className="min-h-screen bg-[#fbfafd]">
      <header data-clock-host className="flex items-center justify-between gap-2 border-b border-stone-200 bg-white px-3 py-3 sm:px-4">
        <BrandMark compact />
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <LiveClock className="hidden sm:inline-flex" />
          <p className="hidden truncate text-sm text-ink/70 sm:block">Petugas check-in</p>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
