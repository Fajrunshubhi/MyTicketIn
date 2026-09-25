import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { loadSessionUser } from "@/lib/session";

function FooterLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="text-sm text-white/70 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {children}
    </Link>
  );
}

export async function SiteFooter() {
  const user = await loadSessionUser();
  const staff = user?.access?.kind === "staff";
  const buyer = Boolean(user?.access?.canBuy);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 bg-[#120e24] text-white">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-12">
        <div className="sm:col-span-2 lg:col-span-4">
          <BrandMark compact onDark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/65">
            Platform tiket event tatap muka untuk pemesanan, pembayaran, dan validasi peserta.
          </p>
        </div>

        <div className="lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Jelajahi</p>
          <ul className="mt-4 space-y-3">
            <li>
              <FooterLink href="/events">Event mendatang</FooterLink>
            </li>
            <li>
              <FooterLink href="/events?when=past">Event selesai</FooterLink>
            </li>
            <li>
              <FooterLink href="/organizers">Penyelenggara</FooterLink>
            </li>
          </ul>
        </div>

        <div className="lg:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Pembeli</p>
          <ul className="mt-4 space-y-3">
            {user ? (
              <>
                {buyer ? (
                  <>
                    <li>
                      <FooterLink href="/tickets">Tiket saya</FooterLink>
                    </li>
                    <li>
                      <FooterLink href="/orders">Order saya</FooterLink>
                    </li>
                  </>
                ) : (
                  <li>
                    <FooterLink href={staff ? "/petugas" : "/dashboard"}>Dashboard</FooterLink>
                  </li>
                )}
                <li>
                  <FooterLink href="/notifications">Notifikasi</FooterLink>
                </li>
              </>
            ) : (
              <>
                <li>
                  <FooterLink href="/login">Masuk</FooterLink>
                </li>
                <li>
                  <FooterLink href="/register">Daftar</FooterLink>
                </li>
                <li>
                  <FooterLink href="/tickets">Tiket saya</FooterLink>
                </li>
              </>
            )}
          </ul>
        </div>

        <div className="lg:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Penyelenggara</p>
          <ul className="mt-4 space-y-3">
            {user ? (
              <>
                <li>
                  <FooterLink href="/dashboard">Dashboard</FooterLink>
                </li>
                <li>
                  <FooterLink href="/organizer/apply">Pengajuan organizer</FooterLink>
                </li>
              </>
            ) : (
              <>
                <li>
                  <FooterLink href="/login?portal=organizer">Masuk penyelenggara</FooterLink>
                </li>
                <li>
                  <FooterLink href="/register">Gabung sebagai pembeli</FooterLink>
                </li>
              </>
            )}
            <li>
              <FooterLink href="/forgot-password">Lupa kata sandi</FooterLink>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-5 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} MyTicketIn. Hak cipta dilindungi.</p>
          <p>Pembayaran sandbox. Transaksi uji, bukan uang nyata.</p>
        </div>
      </div>
    </footer>
  );
}
