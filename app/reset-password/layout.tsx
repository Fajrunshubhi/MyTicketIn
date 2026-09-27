import type { ReactNode } from "react";

export const metadata = {
  title: "Atur kata sandi baru · MyTicketIn",
  description: "Tetapkan kata sandi baru melalui tautan pemulihan sekali pakai.",
  referrer: "no-referrer" as const,
};

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
