import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { checkLiveKitEgressStatus } from "@/lib/livekit-egress";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    await requireUser();
    const params = new URL(request.url).searchParams;
    const fileEgressId = params.get("fileEgressId")?.trim() || "";
    const trackEgressIds = params.getAll("trackEgressId").map((id) => id.trim()).filter(Boolean);
    if (!fileEgressId) {
      return NextResponse.json({ error: "fileEgressId is required." }, { status: 400 });
    }

    const { fileResult, trackResults } = await checkLiveKitEgressStatus(fileEgressId, trackEgressIds);
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
      { error: error instanceof Error ? error.message : "Could not check server recording status." },
      { status: 500 }
    );
  }
}
