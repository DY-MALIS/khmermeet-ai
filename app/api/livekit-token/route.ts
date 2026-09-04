import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { getOptionalUser } from "@/lib/session";
import { cleanRoomName, createInviteToken, verifyInviteToken } from "@/lib/livekit-invite";

export const dynamic = "force-dynamic";

function cleanDisplayName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  return name.slice(0, 80) || "KhmerMeet User";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const room = cleanRoomName(body.room);
    const name = cleanDisplayName(body.name);
    const user = await getOptionalUser();
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() || process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

    if (!room) {
      return NextResponse.json({ error: "Room code is required." }, { status: 400 });
    }

    if (!user && !verifyInviteToken(room, body.inviteToken)) {
      return NextResponse.json({ error: "Invite link is required to join this call as a guest." }, { status: 401 });
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
      // Guests can join calls without email/login, so keep tokens short.
      // Existing connected calls continue; reconnecting after expiry needs
      // opening the invite again.
      ttl: "2h"
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
      name,
      inviteToken: createInviteToken(room)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create LiveKit token." },
      { status: 500 }
    );
  }
}
