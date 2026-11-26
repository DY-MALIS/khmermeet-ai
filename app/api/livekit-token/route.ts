import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { prisma } from "@/lib/prisma";
import { getOptionalUser } from "@/lib/session";
import { cleanRoomName, createInviteToken, verifyInviteToken } from "@/lib/livekit-invite";
import { MAX_MEETING_DURATION_SECONDS } from "@/lib/meeting-duration";
import { chargeAudioUsage, requireAudioAllowance, UsageLimitError } from "@/lib/usage-quota";

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

    // Signed-in participants spend their own allowance. An invited guest
    // spends the room owner's allowance so the server can also remove guests
    // when that allowance is exhausted.
    const identity = `${name.replace(/\s+/g, "-").toLowerCase()}-${crypto.randomUUID()}`;
    let usageSessionId: string | null = null;
    const roomOwner = user ? null : await prisma.liveUsageSession.findFirst({
      where: { room, createdAt: { gte: new Date(Date.now() - MAX_MEETING_DURATION_SECONDS * 1000) } },
      orderBy: { createdAt: "asc" }, select: { userId: true }
    });
    const billingUserId = user?.id ?? roomOwner?.userId;
    if (!billingUserId) {
      return NextResponse.json({ error: "The room owner must join before guests can enter." }, { status: 403 });
    }
    await requireAudioAllowance(billingUserId, "live");
    usageSessionId = crypto.randomUUID();
    await chargeAudioUsage(billingUserId, `live-session:${usageSessionId}`, 0, "live");
    await prisma.liveUsageSession.create({ data: { id: usageSessionId, userId: billingUserId, room, identity } });

    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name,
      metadata: usageSessionId ? JSON.stringify({ usageSessionId }) : undefined,
      // Must outlast the longest call this app supports (12h meeting cap):
      // LiveKit's automatic reconnect reuses this exact token, so a shorter
      // TTL meant one network drop past the 2h mark ended a long call for
      // that participant permanently, with no way back in. The token only
      // grants access to this one room, and anyone holding a valid invite
      // can mint a fresh one on demand anyway, so its lifetime was never
      // the thing actually gating access - the invite token is.
      ttl: MAX_MEETING_DURATION_SECONDS + 60 * 60
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
      inviteToken: createInviteToken(room),
      usageSessionId
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create LiveKit token." },
      { status: error instanceof UsageLimitError ? 402 : 500 }
    );
  }
}
