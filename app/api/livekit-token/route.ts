import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function cleanRoomName(value: unknown) {
  const room = typeof value === "string" ? value.trim().toUpperCase() : "";
  return room.replace(/[^A-Z0-9_-]/g, "").slice(0, 64);
}

function cleanDisplayName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  return name.slice(0, 80) || "KhmerMeet User";
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json().catch(() => ({}));
    const room = cleanRoomName(body.room);
    const name = cleanDisplayName(body.name);
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() || process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

    if (!room) {
      return NextResponse.json({ error: "Room code is required." }, { status: 400 });
    }

    if (!livekitUrl || !apiKey || !apiSecret) {
      return NextResponse.json(
        {
          error: "LiveKit is not configured.",
          hint: "Set NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in Vercel."
        },
        { status: 500 }
      );
    }

    const identity = `${name.replace(/\s+/g, "-").toLowerCase()}-${crypto.randomUUID()}`;
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name,
      ttl: "4h"
    });

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    return NextResponse.json({
      token: await token.toJwt(),
      livekitUrl,
      room,
      identity,
      name
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create LiveKit token." },
      { status: 500 }
    );
  }
}
