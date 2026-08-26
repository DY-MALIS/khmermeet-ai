import { AppShell } from "@/components/app-shell";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // Middleware can run with an expired/stale auth cookie. Re-check the full
  // server session before rendering protected Server Components so they never
  // turn an expected signed-out state into an application-level 500 error.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/dashboard");
  }

  return <AppShell>{children}</AppShell>;
}

