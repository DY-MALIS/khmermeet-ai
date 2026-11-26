import { NextResponse } from "next/server";
import { liveKitRoomService, meterLiveParticipant, usageSessionFromMetadata } from "@/lib/livekit-metering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const client = liveKitRoomService();
  const rooms = await client.listRooms();
  let metered = 0;
  for (const room of rooms) {
    const participants = await client.listParticipants(room.name);
    for (const participant of participants) {
      const sessionId = usageSessionFromMetadata(participant.metadata);
      if (!sessionId) continue;
      const result = await meterLiveParticipant({
        sessionId,
        room: room.name,
        identity: participant.identity,
        joinedAt: new Date(Number(participant.joinedAt) * 1000)
      });
      if (result !== "unknown") metered += 1;
    }
  }
  return NextResponse.json({ ok: true, metered });
}
