import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { cleanRoomName, createInviteToken } from "@/lib/livekit-invite";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json().catch(() => ({}));
    const room = cleanRoomName(body.room);

    if (!room) {
      return NextResponse.json({ error: "Room code is required." }, { status: 400 });
    }

    return NextResponse.json({ room, inviteToken: createInviteToken(room) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create invite link." },
      { status: 500 }
    );
  }
}
