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
    const segmentsEgressId = params.get("segmentsEgressId")?.trim() || "";
    if (!fileEgressId) {
      return NextResponse.json({ error: "fileEgressId is required." }, { status: 400 });
    }

    const { fileResult, segmentsResult } = await checkLiveKitEgressStatus(fileEgressId, segmentsEgressId);
    if (fileResult.status === "failed") {
      return NextResponse.json({ recordingStatus: "failed", error: fileResult.error }, { status: 502 });
    }
    return NextResponse.json({
      recordingStatus: fileResult.status,
      segmentsStatus: segmentsResult.status
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not check server recording status." },
      { status: 500 }
    );
  }
}
