import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isProvider } from "@/lib/provider-oauth";

export async function POST(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return NextResponse.json({ error: "Unknown integration." }, { status: 404 });
  const user = await requireUser();
  await prisma.integrationConnection.deleteMany({ where: { userId: user.id, provider } });
  return NextResponse.json({ ok: true });
}
