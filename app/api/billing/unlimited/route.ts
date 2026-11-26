import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function POST(request: Request) {
  const admin = await requireUser();
  if (!admin.isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof body.unlimited !== "boolean") {
    return NextResponse.json({ error: "Email and access setting are required." }, { status: 400 });
  }
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const billing = await tx.billingAccount.findUnique({ where: { userId: user.id }, select: { unlimitedAccess: true } });
    if (Boolean(billing?.unlimitedAccess) === body.unlimited) return;
    await tx.billingAccount.upsert({ where: { userId: user.id }, create: { userId: user.id, unlimitedAccess: body.unlimited }, update: { unlimitedAccess: body.unlimited } });
    await tx.billingAuditEvent.create({ data: {
      actorUserId: admin.id,
      targetUserId: user.id,
      action: body.unlimited ? "unlimited_enabled" : "unlimited_disabled"
    } });
  });
  return NextResponse.json({ ok: true });
}

