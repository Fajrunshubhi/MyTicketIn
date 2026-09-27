import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Outfit } from "next/font/google";
import { SkipLink } from "@/components/ui/SkipLink";
import { AppLoadingProvider } from "@/components/ui/AppLoading";
import { LiveClock } from "@/components/LiveClock";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: "MyTicketIn",
  description: "Aplikasi tiket event tatap muka untuk pembeli, organizer, petugas, dan admin.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className={`${outfit.variable} ${fraunces.variable} font-sans antialiased`}>
        <SkipLink />
        <div className="live-clock-global pointer-events-none fixed right-3 top-3 z-[80] sm:right-4 sm:top-4">
          <div className="pointer-events-auto rounded-full border border-stone-200/80 bg-white/95 px-3 py-1 shadow-sm">
            <LiveClock global />
          </div>
        </div>
        <AppLoadingProvider>
          <div id="konten-utama">{children}</div>
        </AppLoadingProvider>
      </body>
    </html>
  );
}
