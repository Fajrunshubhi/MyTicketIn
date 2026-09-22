import Link from "next/link";
import { loadSessionUser } from "@/lib/session";

export async function SiteFooter() {
  const user = await loadSessionUser();
  return (
    <footer className="mt-16 bg-navy text-white">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-semibold">MyTicketIn</p>
          <p className="mt-3 text-sm text-white/70">Tiket event tatap muka. Transaksi uji, bukan uang nyata.</p>
        </div>
        <div>
          <p className="text-sm font-semibold">Jelajahi</p>
          <ul className="mt-3 space-y-2 text-sm text-white/75">
            <li>
              <Link className="underline-offset-2 hover:underline" href="/events">
                Katalog event
              </Link>
            </li>
            {user ? (
              <li>
                <Link className="underline-offset-2 hover:underline" href="/dashboard">
                  Dashboard
                </Link>
              </li>
            ) : (
              <>
                <li>
                  <Link className="underline-offset-2 hover:underline" href="/login?portal=buyer">
                    Masuk pembeli
                  </Link>
                </li>
                <li>
                  <Link className="underline-offset-2 hover:underline" href="/login?portal=organizer">
                    Masuk penyelenggara
                  </Link>
                </li>
                <li>
                  <Link className="underline-offset-2 hover:underline" href="/login?portal=admin">
                    Masuk admin
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Akun</p>
          <ul className="mt-3 space-y-2 text-sm text-white/75">
            {user ? (
              user.access?.canBuy ? (
                <li>
                  <Link className="underline-offset-2 hover:underline" href="/tickets">
                    Tiket saya
                  </Link>
                </li>
              ) : (
                <li>
                  <Link className="underline-offset-2 hover:underline" href="/notifications">
                    Notifikasi
                  </Link>
                </li>
              )
            ) : (
              <>
                <li>
                  <Link className="underline-offset-2 hover:underline" href="/register">
                    Daftar
                  </Link>
                </li>
                <li>
                  <Link className="underline-offset-2 hover:underline" href="/forgot-password">
                    Lupa kata sandi
                  </Link>
                </li>
                <li>
                  <Link className="underline-offset-2 hover:underline" href="/tickets">
                    Tiket saya
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Uji</p>
          <p className="mt-3 text-sm text-white/70">Pembayaran sandbox. Label UJI / SANDBOX tetap berlaku pada seluruh alur.</p>
        </div>
      </div>
      <p className="border-t border-white/10 px-6 py-4 text-center text-xs text-white/50">MyTicketIn · MVP akademik</p>
    </footer>
  );
}
