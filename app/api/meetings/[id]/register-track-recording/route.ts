import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizeTranscriptionLanguageMode } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Client-mesh per-speaker recording: each participant's own browser
// records only its own microphone as one continuous file for the whole
// call (no restarts - explicit user request, see livekit-call-room.tsx),
// then uploads it directly to Supabase Storage (bypassing this server
// entirely for the actual bytes - see lib/client/direct-upload.ts) and
// calls this route just to register that upload against the meeting. No
// AI call happens here; transcription is a separate, later step
// (transcribe-stored-segment). Same permissive ownership model as the
// rest of this recording flow - any authenticated participant handed this
// meetingId can register their own recording, not just the host.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting || meeting.status !== "recording") {
      return NextResponse.json({ error: "No live recording found for this meeting." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const speakerIdentity = String(body.speakerIdentity ?? "").trim();
    const speakerName = String(body.speakerName ?? "").trim();
    const audioUrl = String(body.audioUrl ?? "").trim();
    const durationMs = Number(body.durationMs);
    if (!speakerIdentity || !audioUrl || !Number.isFinite(durationMs) || durationMs <= 0) {
      return NextResponse.json({ error: "speakerIdentity, audioUrl, and durationMs are required." }, { status: 400 });
    }
    const languageMode = normalizeTranscriptionLanguageMode(body.languageMode);

    // Idempotent: a retry from the same participant replaces their prior
    // (possibly partial/failed) registration instead of creating a
    // duplicate that would double their text up in the merged transcript.
    await prisma.meetingTranscriptSegment.deleteMany({
      where: { meetingId: id, speakerIdentity, segmentIndex: 1 }
    });
    await prisma.meetingTranscriptSegment.create({
      data: {
        meetingId: id,
        speakerIdentity,
        speakerName: speakerName || speakerIdentity,
        segmentIndex: 1,
        startMs: 0,
        endMs: Math.round(durationMs),
        text: "",
        audioUrl,
        languageMode
      }
    });

    return NextResponse.json({ registered: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not register the recording." },
      { status: 500 }
    );
  }
}
