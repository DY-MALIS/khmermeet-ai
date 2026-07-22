import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { stopSingleTrackEgress } from "@/lib/livekit-egress";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json().catch(() => ({}));
    const egressId = typeof body.egressId === "string" ? body.egressId.trim() : "";
    if (!egressId) {
      return NextResponse.json({ error: "egressId is required." }, { status: 400 });
    }

    const result = await stopSingleTrackEgress(egressId);
    return NextResponse.json({ status: result.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not stop track recording." },
      { status: 500 }
    );
  }
}
