"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EventForm } from "@/components/events/EventForm";

const STEPS = [
  { n: "1", title: "Isi halaman event", body: "Judul, jadwal, lokasi, dan deskripsi." },
  { n: "2", title: "Simpan draf", body: "Anda bisa kembali menyunting kapan saja." },
  { n: "3", title: "Tiket, lalu ajukan", body: "Minimal satu jenis tiket valid sebelum moderasi." },
];

export function DashboardNewEventForm() {
  const router = useRouter();
  return (
    <div className="pb-8">
      <p className="text-sm">
        <Link href="/dashboard/event" className="font-medium text-gold-800 underline-offset-2 hover:underline">
          ← Daftar event
        </Link>
      </p>
      <p className="mt-3 max-w-2xl text-ink/65">
        Buat draf dulu; tiket ditambahkan setelah event tersimpan. Pengajuan ke moderasi membutuhkan minimal satu jenis tiket valid.
      </p>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Langkah membuat event">
        {STEPS.map((step) => (
          <li key={step.n} className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Langkah {step.n}</p>
            <p className="mt-1 text-sm font-semibold text-ink">{step.title}</p>
            <p className="mt-1 text-xs text-ink/55">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8">
        <EventForm onCreated={(id) => router.push(`/dashboard/event/${id}`)} />
      </div>
    </div>
  );
}
