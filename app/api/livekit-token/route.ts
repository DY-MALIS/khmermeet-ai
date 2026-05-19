import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { requireUser } from "@/lib/session";

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json(
      {
        error: "LiveKit is not configured.",
        hint: "Set NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in Vercel."
      },
      { status: 500 }
    );
  }

  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const roomName = typeof body.roomName === "string" && body.roomName.trim() ? body.roomName.trim() : "khmermeet-room";
  const displayName = typeof body.displayName === "string" && body.displayName.trim() ? body.displayName.trim() : user.name ?? "Guest";
  const identity = `${user.id}-${crypto.randomUUID()}`;

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: displayName,
    ttl: "2h"
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url: livekitUrl,
    roomName,
    identity
  });
}
