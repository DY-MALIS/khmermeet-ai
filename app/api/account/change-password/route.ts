import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { normalizeAuthPassword } from "@/lib/auth-input";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const currentPassword = normalizeAuthPassword(body.currentPassword);
    const newPassword = normalizeAuthPassword(body.newPassword);

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "The new password must be at least 6 characters." }, { status: 400 });
    }

    const record = await prisma.user.findUnique({ where: { id: user.id } });
    if (!record) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const currentOk = await compare(currentPassword, record.passwordHash);
    if (!currentOk) {
      return NextResponse.json({ error: "The current password is incorrect." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(newPassword, 10) }
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not change the password. Please try again." }, { status: 500 });
  }
}
