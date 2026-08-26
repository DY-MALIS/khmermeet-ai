import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

// middleware.ts already blocks any request under this app from reaching a
// page/action/API route without a valid session, so a missing session here
// means the two are out of sync (e.g. a route not covered by the middleware
// matcher) rather than an expected user-facing case.
export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized: no active session. Please log in again.");
  }
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? ""
  };
}

// Server-rendered pages must redirect when a session expires. API routes keep
// using requireUser() so their existing JSON/401 error handling is preserved.
export async function requirePageUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/dashboard");
  }
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? ""
  };
}

