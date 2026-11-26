import { NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { meterLiveParticipant, usageSessionFromMetadata } from "@/lib/livekit-metering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!key || !secret) return NextResponse.json({ error: "LiveKit is not configured." }, { status: 503 });
  let event;
  try {
    event = await new WebhookReceiver(key, secret).receive(await request.text(), request.headers.get("Authorization") ?? undefined);
  } catch {
    return NextResponse.json({ error: "Invalid LiveKit signature." }, { status: 401 });
  }
  if ((event.event === "participant_joined" || event.event === "participant_left") && event.room && event.participant) {
    const sessionId = usageSessionFromMetadata(event.participant.metadata);
    if (sessionId) {
      await meterLiveParticipant({
        sessionId,
        room: event.room.name,
        identity: event.participant.identity,
        joinedAt: new Date(Number(event.participant.joinedAt) * 1000),
        leaving: event.event === "participant_left"
      });
    }
  }
  return NextResponse.json({ ok: true });
}
