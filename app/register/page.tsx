import { Suspense } from "react";
import { redirect } from "next/navigation";
import RegisterForm from "./RegisterForm";
import { loadSessionUser, sessionHomePath } from "@/lib/session";
import { RouteLoading } from "@/components/ui/AppLoading";

export default async function RegisterPage() {
  const user = await loadSessionUser();
  if (user) {
    redirect(sessionHomePath(user));
  }
  return (
    <Suspense fallback={<RouteLoading />}>
      <RegisterForm />
    </Suspense>
  );
}
