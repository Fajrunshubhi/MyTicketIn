import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import LogoutButton from "@/components/LogoutButton";
import BrandMark from "@/components/BrandMark";
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
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <BrandMark compact />
        <div className="flex items-center gap-3">
          <p className="text-sm text-ink/70">Petugas check-in</p>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
