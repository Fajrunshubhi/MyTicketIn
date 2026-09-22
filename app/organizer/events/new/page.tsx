import { redirect } from "next/navigation";

export default function OrganizerNewEventRedirect() {
  redirect("/dashboard/event/new");
}
