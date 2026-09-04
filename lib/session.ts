import { createSupabaseServerClient } from "@/lib/supabase/server";

const adminEmails = new Set([
  "dymalis88@gmail.com",
  "hengsereyratanak88@gmail.com"
]);

export function isAdminEmail(email: string | null | undefined) {
  return adminEmails.has((email ?? "").trim().toLowerCase());
}

export function ownerWhere(user: { id: string; email?: string | null }) {
  return isAdminEmail(user.email) ? {} : { createdById: user.id };
}

export function meetingOwnerWhere(user: { id: string; email?: string | null }) {
  return isAdminEmail(user.email) ? {} : { meeting: { createdById: user.id } };
}

// middleware.ts already blocks any request under this app from reaching a
// page/action/API route without a valid session, so a missing session here
// means the two are out of sync (e.g. a route not covered by the middleware
// matcher) rather than an expected user-facing case.
export async function requireUser() {
  const user = await getOptionalUser();
  if (!user) {
    throw new Error("Unauthorized: no active session. Please log in again.");
  }
  return user;
}

// getUser() (not getSession()) revalidates against Supabase's auth server
// rather than trusting the cookie - same reasoning as the middleware
// refresh. The matching Prisma `User` row (needed for the createdById
// foreign key on Meeting) is created once, right after sign-in, in
// app/auth/callback/route.ts - not here, so this stays a fast per-request
// check with no extra database round trip.
export async function getOptionalUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const email = user.email ?? "";
  const name =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
    email;
  return {
    id: user.id,
    name,
    email,
    isAdmin: isAdminEmail(email)
  };
}
