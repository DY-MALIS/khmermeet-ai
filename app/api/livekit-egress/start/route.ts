import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getLiveKitEgressSetupStatus, startLiveKitRoomRecording } from "@/lib/livekit-egress";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cleanRoom(value: unknown) {
  return (typeof value === "string" ? value : "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 64);
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json().catch(() => ({}));
    const room = cleanRoom(body.room);
    const title = typeof body.title === "string" ? body.title.trim() : "";

    if (!room) {
      return NextResponse.json({ error: "Room code is required." }, { status: 400 });
    }

    const setup = getLiveKitEgressSetupStatus();
    if (!setup.ready) {
      return NextResponse.json(
        {
          error: `Server Rec is not configured. Missing: ${setup.missingVariables.join(", ")}.`,
          hint: setup.setupHint,
          missingVariables: setup.missingVariables
        },
        { status: 503 }
      );
    }

    const recording = await startLiveKitRoomRecording(room, title);
    return NextResponse.json(recording);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not start LiveKit server recording.",
        hint: "Set LiveKit Egress S3/Supabase Storage variables in Vercel before using server recording."
      },
      { status: 500 }
    );
  }
}
