import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { extractRealSpeakerNamesFromTranscript, forceSingleSpeakerLabel, normalizeTranscriptionLanguageMode, refineSavedTranscript, transcribeStoredTrackRecording } from "@/lib/storage";
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
  segments: Array<{ id: string; text: string; audioUrl: string | null; languageMode: string | null; speakerName: string | null; speakerIdentity: string }>,
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
        const speakerName = segment.speakerName || segment.speakerIdentity;
        const transcript = forceSingleSpeakerLabel(
          await transcribeStoredTrackRecording(
            segment.audioUrl,
            languageMode,
            Math.max(15000, Math.min(150000, deadline - Date.now())),
            { speakerNames: [speakerName], singleSpeaker: true }
          ),
          speakerName
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

// Keep a safety margin for the final database write and HTTP response. Vercel
// terminates the invocation at maxDuration, so every expensive stage below
// must share this deadline instead of each consuming its own full timeout.
const WORK_DEADLINE_MS = 260000;
const FINALIZE_RESERVE_MS = 10000;
const REFINE_RESERVE_MS = 60000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workDeadline = Date.now() + WORK_DEADLINE_MS;
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
    await catchUpPendingSegments(
      segments,
      Math.min(Date.now() + 200000, workDeadline - REFINE_RESERVE_MS)
    );

    const speakerNames = [
      ...new Set(
        [...(meeting.speakerNames ?? []), ...segments.map((segment) => segment.speakerName || segment.speakerIdentity)]
          .map((name) => name.trim())
          .filter(Boolean)
      )
    ];
    const usableSegmentCount = segments.filter((segment) => segment.text.trim()).length;
    const shouldUseMixedAudio =
      Boolean(meeting.audioUrl) &&
      (usableSegmentCount < 2 || (speakerNames.length > 1 && usableSegmentCount < speakerNames.length));

    const mixedAudioBudget = workDeadline - Date.now() - REFINE_RESERVE_MS;
    const canTranscribeMixedAudio = shouldUseMixedAudio && meeting.audioUrl && mixedAudioBudget >= 15000;
    const rawTranscript =
      canTranscribeMixedAudio && meeting.audioUrl
        ? await transcribeStoredTrackRecording(
            meeting.audioUrl,
            normalizeTranscriptionLanguageMode(meeting.language),
            Math.min(180000, mixedAudioBudget),
            { speakerNames, singleSpeaker: false }
          ).catch(() =>
            segments
              .filter((segment) => segment.text.trim())
              .map((segment) => forceSingleSpeakerLabel(segment.text, segment.speakerName || segment.speakerIdentity))
              .join("\n")
          )
        : segments
            .filter((segment) => segment.text.trim())
            .map((segment) => forceSingleSpeakerLabel(segment.text, segment.speakerName || segment.speakerIdentity))
            .join("\n");
    let transcript = rawTranscript;
    if (hasUsableTranscript(rawTranscript)) {
      // Each segment was transcribed live (mode:"live"), which skips the
      // refine/cleanup pass for latency - raw Khmer STT output comes back
      // with every syllable space-separated instead of properly joined
      // words. One refine pass now that all segments are merged, same as
      // recording-panel.tsx's finalize-transcript step.
      const languageMode = normalizeTranscriptionLanguageMode(meeting.language);
      const refineBudget = workDeadline - Date.now() - FINALIZE_RESERVE_MS;
      transcript = refineBudget >= 5000
        ? await refineSavedTranscript(rawTranscript, languageMode, speakerNames, refineBudget).catch(() => rawTranscript)
        : rawTranscript;
      // Don't overwrite `language` here: segments were already transcribed
      // using the language mode the user picked when recording, set on the
      // meeting when it was created. Forcing "km-en" here discarded that
      // choice and made summary/task generation ignore it downstream.
      const finalSpeakerNames = speakerNames.length ? speakerNames : extractRealSpeakerNamesFromTranscript(transcript);
      await prisma.meeting.update({
        where: { id },
        data: { transcript, summary: null, status: "transcribed", duration: duration ?? meeting.duration, speakerNames: finalSpeakerNames }
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

