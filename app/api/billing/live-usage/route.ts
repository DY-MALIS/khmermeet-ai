import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { chargeAudioUsage, UsageLimitError } from "@/lib/usage-quota";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const id = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid session." }, { status: 400 });
    const sourceKey = `live-session:${id}`;
    const session = await prisma.usageCharge.findUnique({ where: { sourceKey }, select: { userId: true, createdAt: true, kind: true } });
    if (!session || session.userId !== user.id || session.kind !== "live") return NextResponse.json({ error: "Session not found." }, { status: 404 });
    const seconds = Math.min(12 * 3600, Math.max(0, Math.ceil((Date.now() - session.createdAt.getTime()) / 1000)));
    await chargeAudioUsage(user.id, sourceKey, seconds, "live", false);
    return NextResponse.json({ usedSeconds: seconds });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record meeting time." }, { status: error instanceof UsageLimitError ? 402 : 500 });
  }
}
