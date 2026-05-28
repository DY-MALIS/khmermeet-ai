import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { stopLiveKitRoomRecording } from "@/lib/livekit-egress";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json().catch(() => ({}));
    const egressId = typeof body.egressId === "string" ? body.egressId.trim() : "";

    if (!egressId) {
      return NextResponse.json({ error: "egressId is required." }, { status: 400 });
    }

    const recording = await stopLiveKitRoomRecording(egressId);
    return NextResponse.json(recording);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not stop LiveKit server recording." },
      { status: 500 }
    );
  }
}
