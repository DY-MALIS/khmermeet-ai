import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { loadStoredAudioAsFile, normalizeTranscriptionLanguageMode, transcribeAudio } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Second half of the deferred client-mesh recording flow (see
// transcribe-track-chunk, which now only stores raw audio during the call).
// Once a participant's browser stops recording, it fans out one of these
// calls per segment it uploaded - each one is a small, independently
// bounded AI call (same shape as the old live per-chunk transcription, just
// triggered after the call ends instead of during it), so no single request
// has to transcribe more than one ~25s clip. Same permissive ownership
// model as transcribe-track-chunk: any authenticated participant handed
// this meetingId can transcribe a segment they themselves recorded.
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
    const file = await loadStoredAudioAsFile(segment.audioUrl);
    const transcript = await transcribeAudio(file, [], languageMode, { mode: "live", timeoutMs: 45000, singleSpeaker: true });

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
