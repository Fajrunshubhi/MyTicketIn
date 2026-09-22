"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { roleLabel, type AccountProfile } from "@/lib/account";

type Me = AccountProfile;

function DashLink({ href, icon, children }: { href: string; icon: IconName; children: string }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-ink transition hover:border-gold-400 hover:bg-gold-50"
    >
      <Icon name={icon} className="h-4 w-4 shrink-0 text-gold-600" />
      {children}
    </a>
  );
}

export function DashboardClient() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const body = (await res.json()) as { data?: Me };
        if (body.data) {
          setMe(body.data);
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!me) {
    return (
      <div className="px-6 py-10">
        <p role="status">Memuat sesi…</p>
      </div>
    );
  }

  const admin = Boolean(me.access?.isAdmin || me.role === "ADMIN");
  const applying = Boolean(me.access?.canApplyOrganizer);

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16">
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-paper p-8 shadow-card md:p-12">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-gold-700">Dashboard</p>
        <h1 className="font-display mt-4 max-w-3xl text-4xl text-ink md:text-5xl">
          Selamat datang, {me.name || me.username}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink/65">
          {admin
            ? "Anda masuk sebagai admin aplikasi. Kelola pengajuan organizer dan moderasi event."
            : "Anda masuk sebagai pembeli tiket. Lihat katalog event yang sudah dipublikasikan."}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <DashLink href="/dashboard/profile" icon="user">
            Edit profil
          </DashLink>
          <DashLink href="/notifications" icon="bell">
            Notifikasi
          </DashLink>
          {!admin ? (
            <>
              <DashLink href="/orders" icon="orders">
                Order saya
              </DashLink>
              <DashLink href="/tickets" icon="ticket">
                Tiket saya
              </DashLink>
            </>
          ) : null}
          {applying ? (
            <>
              <DashLink href="/organizer/apply" icon="userPlus">
                Ajukan sebagai penyelenggara
              </DashLink>
              <DashLink href="/organizer/status" icon="file">
                Status pengajuan
              </DashLink>
            </>
          ) : null}
          {admin ? (
            <>
              <DashLink href="/admin/operations" icon="clock">
                Antrean operasional
              </DashLink>
              <DashLink href="/admin/organizers" icon="building">
                Moderasi organizer
              </DashLink>
              <DashLink href="/admin/events" icon="catalog">
                Moderasi event
              </DashLink>
              <DashLink href="/admin/audit" icon="file">
                Jejak audit
              </DashLink>
              <DashLink href="/admin/payment-reconciliations" icon="orders">
                Rekonsiliasi pembayaran
              </DashLink>
              <DashLink href="/admin/refunds" icon="ticket">
                Refund sandbox
              </DashLink>
              <DashLink href="/admin/password-reset" icon="shield">
                Bantuan reset kata sandi
              </DashLink>
            </>
          ) : null}
        </div>
        <dl className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <dt className="flex items-center gap-2 text-sm text-ink/45">
              <Icon name="user" className="h-4 w-4" />
              Username
            </dt>
            <dd className="mt-1 text-ink">{me.username}</dd>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <dt className="flex items-center gap-2 text-sm text-ink/45">
              <Icon name="mail" className="h-4 w-4" />
              Email
            </dt>
            <dd className="mt-1 text-ink">{me.email}</dd>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <dt className="flex items-center gap-2 text-sm text-ink/45">
              <Icon name="shield" className="h-4 w-4" />
              Jenis akun
            </dt>
            <dd className="mt-1 text-ink">{roleLabel(me)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
