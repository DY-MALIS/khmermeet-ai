import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { normalizeAuthEmail, normalizeAuthPassword } from "@/lib/auth-input";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Plain native-form POST endpoint, deliberately not a React Server Action
// (`<form action={fn}>`) - a Server Action needs the client JS runtime to
// intercept the submit and POST to its encoded endpoint, which is exactly
// the class of thing already confirmed (see components/auth-form.tsx's
// LoginForm) to silently never reach the server at all on some real
// machines (a browser extension or network filter blocking fetch/XHR while
// still allowing normal navigations). A native form POST straight to a
// route handler can't be caught by that.
export async function POST(request: Request) {
  const baseUrl = new URL(request.url).origin;
  const formData = await request.formData().catch(() => null);
  const name = typeof formData?.get("name") === "string" ? (formData.get("name") as string).trim() : "";
  const email = normalizeAuthEmail(formData?.get("email"));
  const password = normalizeAuthPassword(formData?.get("password"));

  if (!name || !email || password.length < 6) {
    return NextResponse.redirect(`${baseUrl}/register?error=invalid`, { status: 303 });
  }

  try {
    await prisma.user.create({ data: { name, email, passwordHash: await hash(password, 10) } });
  } catch (error) {
    // A duplicate email (P2002 = unique constraint violation) is a routine,
    // expected case, not a real server error.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.redirect(`${baseUrl}/register?error=exists`, { status: 303 });
    }
    return NextResponse.redirect(`${baseUrl}/register?error=unknown`, { status: 303 });
  }

  // Creating the row here isn't a session - send them to log in with the
  // credentials they just chose rather than a /dashboard they have no access to.
  return NextResponse.redirect(`${baseUrl}/login?registered=1`, { status: 303 });
}
