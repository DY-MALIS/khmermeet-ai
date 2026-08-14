import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizeTranscriptionLanguageMode, transcribeAudio } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Client-mesh per-speaker recording: every participant's own browser records
// only its own microphone (no server-side mixing, no S3 upload - see
// livekit-call-room.tsx for why LiveKit Egress's S3 path was dropped) and
// posts each ~25s segment here directly as it's captured. Unlike every other
// meeting-scoped route, this intentionally does NOT restrict to
// createdById === user.id - the host who owns the Meeting row is rarely the
// only person recorded, so any other authenticated participant who was
// handed this meetingId over the live LiveKit data channel must be able to
// post their own audio too. The meeting must still be actively "recording"
// so a stale/guessed id can't be used to spam an unrelated meeting.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-transcribe");
    if (limited) return limited;
    const { id } = await params;
    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting || meeting.status !== "recording") {
      return NextResponse.json({ error: "No live recording found for this meeting." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("audio");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing audio chunk." }, { status: 400 });
    }

    const speakerIdentity = String(formData.get("speakerIdentity") ?? "").trim();
    const speakerName = String(formData.get("speakerName") ?? "").trim();
    const index = Number(formData.get("index") ?? 0);
    const startOffsetMs = Number(formData.get("startOffsetMs") ?? 0);
    if (!speakerIdentity || !Number.isFinite(startOffsetMs)) {
      return NextResponse.json({ error: "speakerIdentity and startOffsetMs are required." }, { status: 400 });
    }
    const languageMode = normalizeTranscriptionLanguageMode(formData.get("languageMode"));

    // No speakerNames hint here: this is already single-speaker audio, so the
    // label is attached externally below instead of asked of the model.
    const transcript = await transcribeAudio(file, [], languageMode, { mode: "live", timeoutMs: 45000 });

    if (!hasUsableTranscript(transcript)) {
      return NextResponse.json({ transcript: "", skipped: true, index });
    }

    const segmentMs = 25000;
    const startMs = startOffsetMs + (index - 1) * segmentMs;
    const endMs = startMs + segmentMs;

    await prisma.meetingTranscriptSegment.create({
      data: {
        meetingId: id,
        speakerIdentity,
        speakerName: speakerName || speakerIdentity,
        segmentIndex: index,
        startMs,
        endMs,
        text: transcript.trim()
      }
    });

    return NextResponse.json({ transcript, index });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not transcribe audio segment." },
      { status: 500 }
    );
  }
}
