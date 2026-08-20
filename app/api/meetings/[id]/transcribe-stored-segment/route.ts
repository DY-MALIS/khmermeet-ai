import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { forceSingleSpeakerLabel, normalizeTranscriptionLanguageMode, transcribeStoredTrackRecording } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// A participant's stored recording is one continuous file for the whole
// call (no restarts - see register-track-recording).
// transcribeStoredTrackRecording splits anything over OpenRouter's ~24MB
// ceiling into a few pieces and transcribes them in parallel, so total
// time is close to one piece's time, not the sum - 240s leaves real
// headroom above that per-piece timeout.
export const maxDuration = 240;

// Second half of the deferred client-mesh recording flow (see
// register-track-recording, which only stores the raw audio). Once a
// participant's browser stops recording, it calls this once for the one
// continuous file it uploaded - triggered after the call ends instead of
// during it, so no AI activity happens while the call is still live. Same
// permissive ownership model as register-track-recording: any
// authenticated participant handed this meetingId can transcribe a segment
// they themselves recorded.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-transcribe");
    if (limited) return limited;
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const speakerIdentity = String(body.speakerIdentity ?? "").trim();
    const index = Number(body.index);
    if (!speakerIdentity || !Number.isFinite(index)) {
      return NextResponse.json({ error: "speakerIdentity and index are required." }, { status: 400 });
    }

    const segment = await prisma.meetingTranscriptSegment.findFirst({
      where: { meetingId: id, speakerIdentity, segmentIndex: index }
    });
    if (!segment) {
      return NextResponse.json({ error: "Segment not found." }, { status: 404 });
    }
    if (segment.text.trim()) {
      // Already transcribed (retry after a flaky network response, etc.) -
      // idempotent, just return what's there.
      return NextResponse.json({ transcript: segment.text, index, alreadyDone: true });
    }
    if (!segment.audioUrl) {
      return NextResponse.json({ error: "No stored audio for this segment." }, { status: 404 });
    }

    const languageMode = normalizeTranscriptionLanguageMode(segment.languageMode);
    const transcript = forceSingleSpeakerLabel(
      await transcribeStoredTrackRecording(segment.audioUrl, languageMode, 180000, {
        speakerNames: [segment.speakerName || segment.speakerIdentity],
        singleSpeaker: true
      }),
      segment.speakerName || segment.speakerIdentity
    );

    if (!hasUsableTranscript(transcript)) {
      return NextResponse.json({ transcript: "", skipped: true, index });
    }

    await prisma.meetingTranscriptSegment.update({
      where: { id: segment.id },
      data: { text: transcript.trim() }
    });

    return NextResponse.json({ transcript, index });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not transcribe stored segment." },
      { status: 500 }
    );
  }
}
