"use client";

import { type ReactNode } from "react";
import { AdminShell } from "@/components/dashboard/AdminShell";
import { BuyerShell } from "@/components/dashboard/BuyerShell";
import { OrganizerShell } from "@/components/dashboard/OrganizerShell";

export function DashboardFrame({
  role,
  canWrite = true,
  children,
}: {
  role: "buyer" | "organizer" | "admin";
  canWrite?: boolean;
  children: ReactNode;
}) {
  if (role === "organizer") return <OrganizerShell canWrite={canWrite}>{children}</OrganizerShell>;
  if (role === "admin") return <AdminShell>{children}</AdminShell>;
  return <BuyerShell>{children}</BuyerShell>;
}
