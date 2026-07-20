import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { checkLiveKitEgressStatus } from "@/lib/livekit-egress";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    await requireUser();
    const egressId = new URL(request.url).searchParams.get("egressId")?.trim() || "";
    if (!egressId) {
      return NextResponse.json({ error: "egressId is required." }, { status: 400 });
    }

    const result = await checkLiveKitEgressStatus(egressId);
    if (result.status === "failed") {
      return NextResponse.json({ egressId, recordingStatus: "failed", error: result.error }, { status: 502 });
    }
    return NextResponse.json({ egressId, recordingStatus: result.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not check server recording status." },
      { status: 500 }
    );
  }
}
