import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizeTranscriptionLanguageMode, saveLocalAudio, transcribeAudio } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
//
// This route used to transcribe each segment immediately (an AI call per
// upload, live, while the meeting was still happening). Confirmed live that
// this made a long real call's overall reliability depend on ~100+
// individual AI calls succeeding one by one during the meeting itself, and
// the user explicitly asked for no AI activity while still recording -
// record fully, then transcribe once at the end. This route now only
// stores the raw audio (fast, no AI, no rate limit needed) - actual
// transcription happens afterward via transcribe-stored-segment, fanned out
// from the client once the call ends (see stopLocalTrackRecording).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
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

    const segmentMs = 25000;
    const startMs = startOffsetMs + (index - 1) * segmentMs;
    const endMs = startMs + segmentMs;

    // saveLocalAudio already tries Supabase Storage first, then falls back
    // to storing the bytes directly in Postgres (AudioFile table) on
    // Vercel when Supabase isn't configured - confirmed live that this
    // deployment's SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are unset, so
    // every segment lands in the DB fallback. That's fine here: each
    // segment is a ~25s clip (tens to a few hundred KB), nowhere near the
    // 4MB Vercel-body-relayed limit that fallback enforces - it's only a
    // problem for a single multi-hour file, not one small piece of it.
    const audioUrl = await saveLocalAudio(file).catch(() => "");

    if (audioUrl) {
      await prisma.meetingTranscriptSegment.create({
        data: {
          meetingId: id,
          speakerIdentity,
          speakerName: speakerName || speakerIdentity,
          segmentIndex: index,
          startMs,
          endMs,
          text: "",
          audioUrl,
          languageMode
        }
      });
      return NextResponse.json({ stored: true, index });
    }

    // saveLocalAudio failed outright (shouldn't happen for a small segment,
    // but not impossible) - fall back to the original live-transcribe-
    // immediately behavior instead of losing the segment entirely.
    const transcript = await transcribeAudio(file, [], languageMode, { mode: "live", timeoutMs: 25000, singleSpeaker: true });
    if (!hasUsableTranscript(transcript)) {
      return NextResponse.json({ transcript: "", skipped: true, index });
    }
    await prisma.meetingTranscriptSegment.create({
      data: {
        meetingId: id,
        speakerIdentity,
        speakerName: speakerName || speakerIdentity,
        segmentIndex: index,
        startMs,
        endMs,
        text: transcript.trim(),
        languageMode
      }
    });
    return NextResponse.json({ transcript, index });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save audio segment." },
      { status: 500 }
    );
  }
}
