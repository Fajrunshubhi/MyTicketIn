import { redirect } from "next/navigation";
import { loadSessionUser } from "@/lib/session";

export async function requireOrganizer(callback: string) {
  const user = await loadSessionUser();
  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callback)}&portal=organizer`);
  }
  if (user.access?.kind !== "organizer") {
    redirect("/dashboard");
  }
  return user;
}

export async function requireOrganizerWrite(callback: string) {
  const user = await requireOrganizer(callback);
  if (!user.access?.canOrganize) {
    redirect("/dashboard/organizer/status");
  }
  return user;
}
