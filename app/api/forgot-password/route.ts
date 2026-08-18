import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";
import { authEmailLookupCandidates, normalizeAuthEmail } from "@/lib/auth-input";

export const dynamic = "force-dynamic";

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// Native form POST, not a Server Action - same reasoning as
// app/api/register/route.ts: a Server Action needs the client JS runtime to
// intercept the submit, which is confirmed to silently fail on some real
// machines. This form matters most for someone already locked out of their
// account, so it can least afford to depend on that.
export async function POST(request: Request) {
  const baseUrl = new URL(request.url).origin;
  const formData = await request.formData().catch(() => null);
  const rawEmail = formData?.get("email");
  const email = normalizeAuthEmail(rawEmail);
  if (!email) {
    return NextResponse.redirect(`${baseUrl}/forgot-password?error=invalid`, { status: 303 });
  }

  // Enforced before the user lookup below so this can't be used to probe
  // whether an email is registered by timing/behavior differences either.
  try {
    await enforceRateLimit(email, "password-reset-request");
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.redirect(`${baseUrl}/forgot-password?error=ratelimit`, { status: 303 });
    }
    throw error;
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: authEmailLookupCandidates(rawEmail).map((candidate) => ({
        email: { equals: candidate, mode: "insensitive" as const }
      }))
    }
  });
  // Always end up on the same "check your email" page whether or not the
  // account exists - confirming/denying an email's registration here would
  // let anyone enumerate real accounts.
  if (user) {
    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS) }
    });
    const resetUrl = `${process.env.NEXTAUTH_URL || baseUrl}/reset-password?token=${token}`;
    // Swallowed behind the generic response above (an email-provider outage
    // still shouldn't reveal account existence) - logged server-side so a
    // misconfigured RESEND_API_KEY/domain is still visible to whoever reads
    // the logs, instead of silently pretending to have worked.
    await sendPasswordResetEmail(email, resetUrl).catch((error) => {
      console.error("sendPasswordResetEmail failed:", error);
    });
  }

  return NextResponse.redirect(`${baseUrl}/forgot-password?sent=1`, { status: 303 });
}
