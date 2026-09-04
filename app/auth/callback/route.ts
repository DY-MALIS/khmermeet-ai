import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Supabase redirects here after Google's own consent screen completes, with
// a one-time `code` to exchange for a real session (this is what actually
// sets the session cookies - the redirect alone doesn't).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=CallbackMissingCode`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=CallbackFailed`);
  }

  // The Meeting.createdById foreign key needs a matching User row to exist.
  // Done once here, right after sign-in, rather than on every request -
  // `id` is Supabase's own user id, reused directly as the Prisma User.id
  // so no separate mapping table is needed.
  const existing = await prisma.user.findUnique({ where: { id: data.user.id } });
  if (!existing) {
    const email = (data.user.email ?? "").trim().toLowerCase();
    const name =
      (typeof data.user.user_metadata?.full_name === "string" && data.user.user_metadata.full_name) ||
      (typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name) ||
      email;
    // A pre-migration email/password account has the same email but a
    // different (cuid) id. Google verifies the email it hands back, so
    // matching on it here is safe - repoint that existing row's id at this
    // new Supabase id (an update, not a new row) instead of creating a
    // second account with none of the old meetings. The Meeting/Task/
    // Decision foreign keys are all ON UPDATE CASCADE, so every record
    // that pointed at the old id follows automatically in the same
    // statement.
    const byEmail = email ? await prisma.user.findFirst({ where: { email } }) : null;
    if (byEmail) {
      await prisma.user.update({ where: { id: byEmail.id }, data: { id: data.user.id } }).catch(() => undefined);
    } else {
      await prisma.user.create({ data: { id: data.user.id, email, name } }).catch(() => undefined);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
