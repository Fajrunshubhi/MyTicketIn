import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Outfit } from "next/font/google";
import { SkipLink } from "@/components/ui/SkipLink";
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
        <div id="konten-utama">{children}</div>
      </body>
    </html>
  );
}
