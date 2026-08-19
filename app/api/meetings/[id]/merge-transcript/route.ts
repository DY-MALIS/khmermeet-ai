import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizeTranscriptionLanguageMode, refineSavedTranscript, transcribeStoredTrackRecording } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { rateLimitResponse } from "@/lib/rate-limit";
import { clampMeetingDurationSeconds } from "@/lib/meeting-duration";

// Segments are normally transcribed by the client calling
// transcribe-stored-segment right after it stops recording (see
// stopLocalTrackRecording in livekit-call-room.tsx) - this only catches
// stragglers left behind if that didn't finish (a tab closed early, a
// flaky request). Each participant now has at most one stored recording
// (one continuous file for the whole call, no restarts), so this is a
// handful of large-file transcriptions at most, not hundreds of small
// ones - still time-boxed so a meeting with several leftover recordings
// doesn't risk the same kind of timeout this route was fixed for earlier.
async function catchUpPendingSegments(
  segments: Array<{ id: string; text: string; audioUrl: string | null; languageMode: string | null }>,
  deadline: number
) {
  const pending = segments.filter((segment) => !segment.text.trim() && segment.audioUrl);
  if (!pending.length) return;

  const queue = [...pending];
  async function worker() {
    while (queue.length && Date.now() < deadline) {
      const segment = queue.shift();
      if (!segment || !segment.audioUrl) continue;
      try {
        const languageMode = normalizeTranscriptionLanguageMode(segment.languageMode);
        const transcript = await transcribeStoredTrackRecording(
          segment.audioUrl,
          languageMode,
          Math.max(15000, Math.min(150000, deadline - Date.now()))
        );
        if (hasUsableTranscript(transcript)) {
          const trimmed = transcript.trim();
          await prisma.meetingTranscriptSegment.update({ where: { id: segment.id }, data: { text: trimmed } });
          segment.text = trimmed;
        }
      } catch {
        // Best-effort - this segment just stays out of the final transcript.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
}

export const dynamic = "force-dynamic";
// Catch-up transcription of a full-length recording (see above) can itself
// take a couple minutes for a long call, on top of the refine pass's own
// ~55s internal ceiling - 280s (near Vercel's practical function limit)
// gives real headroom for both instead of the tight margin that caused a
// real production timeout earlier.
export const maxDuration = 280;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-generate");
    if (limited) return limited;
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
    if (!meeting) {
      return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const duration = "duration" in body ? clampMeetingDurationSeconds(body.duration) : undefined;

    const segments = await prisma.meetingTranscriptSegment.findMany({
      where: { meetingId: id },
      orderBy: [{ startMs: "asc" }, { segmentIndex: "asc" }, { id: "asc" }]
    });
    if (!segments.length) {
      // Closes out the transient "recording" status (set by
      // /api/meetings/start-live for the client-mesh per-speaker recording
      // path) even when nobody's audio produced usable speech, so the
      // meeting doesn't stay stuck accepting track-chunk uploads forever.
      if (meeting.status === "recording") {
        await prisma.meeting.update({ where: { id }, data: { status: "recorded", duration: duration ?? meeting.duration } });
      }
      return NextResponse.json({ transcript: "", merged: false });
    }

    // Reserve most of the 280s budget for this catch-up pass, leaving the
    // refine call below (its own 55s internal ceiling) real room to run.
    await catchUpPendingSegments(segments, Date.now() + 200000);

    const rawTranscript = segments
      .filter((segment) => segment.text.trim())
      .map((segment) => `${segment.speakerName || segment.speakerIdentity}: ${segment.text}`)
      .join("\n");
    let transcript = rawTranscript;
    if (hasUsableTranscript(rawTranscript)) {
      // Each segment was transcribed live (mode:"live"), which skips the
      // refine/cleanup pass for latency - raw Khmer STT output comes back
      // with every syllable space-separated instead of properly joined
      // words. One refine pass now that all segments are merged, same as
      // recording-panel.tsx's finalize-transcript step.
      const speakerNames = [...new Set(segments.map((segment) => segment.speakerName || segment.speakerIdentity))];
      const languageMode = normalizeTranscriptionLanguageMode(meeting.language);
      transcript = await refineSavedTranscript(rawTranscript, languageMode, speakerNames).catch(() => rawTranscript);
      // Don't overwrite `language` here: segments were already transcribed
      // using the language mode the user picked when recording, set on the
      // meeting when it was created. Forcing "km-en" here discarded that
      // choice and made summary/task generation ignore it downstream.
      await prisma.meeting.update({
        where: { id },
        data: { transcript, summary: null, status: "transcribed", duration: duration ?? meeting.duration }
      });
    }

    revalidatePath("/transcripts");
    revalidatePath("/summaries");
    revalidatePath("/dashboard");
    revalidatePath(`/meetings/${id}`);

    return NextResponse.json({ transcript, merged: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not merge transcript segments." },
      { status: 500 }
    );
  }
}
