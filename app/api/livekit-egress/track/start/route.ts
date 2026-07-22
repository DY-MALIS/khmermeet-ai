import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { startParticipantTrackEgress } from "@/lib/livekit-egress";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
    const identity = typeof body.identity === "string" ? body.identity.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const recordingBase = typeof body.recordingBase === "string" ? body.recordingBase.trim() : "";
    const recordingStartedAt = Number(body.recordingStartedAt);

    if (!room || !identity || !recordingBase || !Number.isFinite(recordingStartedAt)) {
      return NextResponse.json({ error: "room, identity, recordingBase, and recordingStartedAt are required." }, { status: 400 });
    }
    if (!recordingBase.startsWith("livekit-egress/") || recordingBase.includes("..")) {
      return NextResponse.json({ error: "Invalid recordingBase." }, { status: 400 });
    }

    const job = await startParticipantTrackEgress(room, recordingBase, identity, name, recordingStartedAt);
    if (!job) {
      return NextResponse.json({ skipped: true, reason: "no-microphone-track" });
    }
    return NextResponse.json(job);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start track recording for participant." },
      { status: 500 }
    );
  }
}
