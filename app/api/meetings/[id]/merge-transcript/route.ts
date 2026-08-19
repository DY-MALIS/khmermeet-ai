import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { loadStoredAudioAsFile, normalizeTranscriptionLanguageMode, refineSavedTranscript, transcribeAudio } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { rateLimitResponse } from "@/lib/rate-limit";

// Segments are normally transcribed by the client fanning out
// transcribe-stored-segment calls right after it stops recording (see
// stopLocalTrackRecording in livekit-call-room.tsx) - this only catches
// stragglers left behind if that fan-out didn't fully finish (a tab closed
// early, a flaky request). Time-boxed rather than "do them all", so a
// meeting with many leftover segments still finishes within maxDuration
// instead of risking the same kind of timeout this route was just fixed
// for - anything not caught up here just won't be in the transcript.
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
        const file = await loadStoredAudioAsFile(segment.audioUrl);
        const transcript = await transcribeAudio(file, [], languageMode, {
          mode: "live",
          timeoutMs: Math.max(5000, Math.min(25000, deadline - Date.now())),
          singleSpeaker: true
        });
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
  await Promise.all(Array.from({ length: Math.min(6, pending.length) }, worker));
}

export const dynamic = "force-dynamic";
// A single refine call's own internal timeout (lib/storage.ts
// refineSavedTranscript, 55s) leaves only ~5s of margin against a 60s
// maxDuration for the DB queries and response around it - confirmed live
// to actually get killed by Vercel's own hard timeout on a real 292-
// segment/~30k-char meeting (2 parallel refine chunks, one landed near the
// 55s mark). 120s gives real headroom above that 55s ceiling.
export const maxDuration = 120;

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
    const duration = Number.isFinite(Number(body.duration)) && Number(body.duration) > 0 ? Math.round(Number(body.duration)) : undefined;

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

    // Reserve most of the 120s budget for this catch-up pass, leaving the
    // refine call below (its own 55s internal ceiling) real room to run.
    await catchUpPendingSegments(segments, Date.now() + 55000);

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
