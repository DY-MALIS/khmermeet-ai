import { AppShell } from "@/components/app-shell";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // Middleware can run with an expired/stale auth cookie. Re-check the full
  // server session before rendering protected Server Components so they never
  // turn an expected signed-out state into an application-level 500 error.
  const user = await getOptionalUser();
  if (!user) {
    redirect("/login?callbackUrl=/dashboard");
  }

  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}

