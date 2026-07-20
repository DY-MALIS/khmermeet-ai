import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { stopLiveKitRoomRecordingAndWait } from "@/lib/livekit-egress";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json().catch(() => ({}));
    const fileEgressId = typeof body.fileEgressId === "string" ? body.fileEgressId.trim() : "";
    const segmentsEgressId = typeof body.segmentsEgressId === "string" ? body.segmentsEgressId.trim() : "";

    if (!fileEgressId) {
      return NextResponse.json({ error: "fileEgressId is required." }, { status: 400 });
    }

    const { fileResult, segmentsResult } = await stopLiveKitRoomRecordingAndWait(fileEgressId, segmentsEgressId);
    if (fileResult.status === "failed") {
      return NextResponse.json({ recordingStatus: "failed", error: fileResult.error }, { status: 502 });
    }
    return NextResponse.json({
      recordingStatus: fileResult.status,
      segmentsStatus: segmentsResult.status
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not stop LiveKit server recording." },
      { status: 500 }
    );
  }
}
