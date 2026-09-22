"use client";

import { useRouter } from "next/navigation";
import { EventForm } from "@/components/events/EventForm";

export function DashboardNewEventForm() {
  const router = useRouter();
  return (
    <div>
      <p className="max-w-2xl text-ink/65">Simpan draf kapan saja. Pengajuan ke moderasi membutuhkan minimal satu jenis tiket valid.</p>
      <div className="mt-6">
        <EventForm onCreated={(id) => router.push(`/dashboard/event/${id}`)} />
      </div>
    </div>
  );
}
