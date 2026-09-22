import { redirect } from "next/navigation";
import { loadSessionUser } from "@/lib/session";

export async function requireOrganizer(callback: string) {
  const user = await loadSessionUser();
  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callback)}&portal=organizer`);
  }
  if (!user.access?.canOrganize) {
    redirect("/dashboard");
  }
  return user;
}
