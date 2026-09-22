import { Suspense } from "react";
import { redirect } from "next/navigation";
import RegisterForm from "./RegisterForm";
import { loadSessionUser, sessionHomePath } from "@/lib/session";

export default async function RegisterPage() {
  const user = await loadSessionUser();
  if (user) {
    redirect(sessionHomePath(user));
  }
  return (
    <Suspense fallback={<p className="p-6">Memuat…</p>}>
      <RegisterForm />
    </Suspense>
  );
}
