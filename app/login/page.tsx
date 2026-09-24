import { Suspense } from "react";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { RouteLoading } from "@/components/ui/AppLoading";
import { loadSessionUser, sessionHomePath } from "@/lib/session";

export default async function LoginPage() {
  const user = await loadSessionUser();
  if (user) {
    redirect(sessionHomePath(user));
  }
  return (
    <Suspense fallback={<RouteLoading />}>
      <LoginForm />
    </Suspense>
  );
}
