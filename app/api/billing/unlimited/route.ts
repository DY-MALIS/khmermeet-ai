import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function POST(request: Request) {
  const admin = await requireUser();
  if (!admin.isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || typeof body.unlimited !== "boolean") {
    return NextResponse.json({ error: "Email and access setting are required." }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  await prisma.user.update({ where: { id: user.id }, data: { unlimitedAccess: body.unlimited } });
  return NextResponse.json({ ok: true });
}
