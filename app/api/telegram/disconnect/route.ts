import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function POST() {
  const user = await requireUser();
  await prisma.$transaction([
    prisma.telegramConnection.deleteMany({ where: { userId: user.id } }),
    prisma.telegramLink.deleteMany({ where: { userId: user.id } })
  ]);
  return NextResponse.json({ ok: true });
}
