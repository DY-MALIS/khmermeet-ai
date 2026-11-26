import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { UsageLimitError } from "@/lib/usage-quota";
import { liveKitRoomService, meterLiveParticipant } from "@/lib/livekit-metering";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const id = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid session." }, { status: 400 });
    const sourceKey = `live-session:${id}`;
    const session = await prisma.liveUsageSession.findUnique({ where: { id } });
    if (!session || session.userId !== user.id) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    const participant = await liveKitRoomService().getParticipant(session.room, session.identity).catch(() => null);
    if (participant) {
      await meterLiveParticipant({
        sessionId: id, room: session.room, identity: session.identity,
        joinedAt: new Date(Number(participant.joinedAt) * 1000)
      });
    }
    const charge = await prisma.usageCharge.findUnique({ where: { sourceKey }, select: { seconds: true } });
    return NextResponse.json({ usedSeconds: charge?.seconds ?? 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record meeting time." }, { status: error instanceof UsageLimitError ? 402 : 500 });
  }
}
