import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeAuthPassword } from "@/lib/auth-input";

export const dynamic = "force-dynamic";

// Native form POST, not a Server Action - see app/api/forgot-password/route.ts.
export async function POST(request: Request) {
  const baseUrl = new URL(request.url).origin;
  const formData = await request.formData().catch(() => null);
  const token = typeof formData?.get("token") === "string" ? (formData.get("token") as string).trim() : "";
  const password = normalizeAuthPassword(formData?.get("password"));

  if (!token) {
    return NextResponse.redirect(`${baseUrl}/forgot-password`, { status: 303 });
  }
  if (password.length < 6) {
    return NextResponse.redirect(`${baseUrl}/reset-password?token=${encodeURIComponent(token)}&error=short`, { status: 303 });
  }

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken || resetToken.expiresAt < new Date()) {
    return NextResponse.redirect(`${baseUrl}/forgot-password?error=expired`, { status: 303 });
  }

  const passwordHash = await hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    // Every outstanding token for this user, not just the one used - a
    // password change should invalidate any other reset links still
    // floating in an old email.
    prisma.passwordResetToken.deleteMany({ where: { userId: resetToken.userId } })
  ]);

  return NextResponse.redirect(`${baseUrl}/login?reset=1`, { status: 303 });
}
