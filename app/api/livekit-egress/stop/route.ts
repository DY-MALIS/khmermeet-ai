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
    const trackEgressIds = Array.isArray(body.trackEgressIds)
      ? body.trackEgressIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
      : [];

    if (!fileEgressId) {
      return NextResponse.json({ error: "fileEgressId is required." }, { status: 400 });
    }

    const { fileResult, trackResults } = await stopLiveKitRoomRecordingAndWait(fileEgressId, trackEgressIds);
    if (fileResult.status === "failed") {
      return NextResponse.json({ recordingStatus: "failed", error: fileResult.error }, { status: 502 });
    }
    return NextResponse.json({
      recordingStatus: fileResult.status,
      trackResults: trackResults.map(({ egressId, result }) => ({
        egressId,
        status: result.status,
        error: result.status === "failed" ? result.error : undefined
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not stop LiveKit server recording." },
      { status: 500 }
    );
  }
}
