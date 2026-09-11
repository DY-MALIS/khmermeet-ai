import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import {
  createSegmentSpeakerLabelResolver,
  extractRealSpeakerNamesFromTranscript,
  forceSingleSpeakerLabel,
  isPlaceholderParticipantName,
  loadStoredAudioAsFile,
  normalizeTranscriptionLanguageMode,
  refineSavedTranscript,
  sanitizeKnownSpeakerNames,
  transcribeStoredTrackRecording
} from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { publicAiTranscriptionError } from "@/lib/api-error-messages";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const WORK_DEADLINE_MS = 270000;
const FINALIZE_RESERVE_MS = 10000;
const REFINE_RESERVE_MS = 60000;
const MINIMUM_ATTEMPT_MS = 12000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workDeadline = Date.now() + WORK_DEADLINE_MS;
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-transcribe");
    if (limited) return limited;
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({
      where: { id, ...ownerWhere(user) },
      include: {
        transcriptSegments: {
          orderBy: [{ startMs: "asc" }, { segmentIndex: "asc" }, { id: "asc" }]
        }
      }
    });

    if (!meeting) {
      return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    }

    if (!meeting.audioUrl && !meeting.transcriptSegments.length) {
      return NextResponse.json({ error: "No audio file found for this meeting." }, { status: 400 });
    }

    const body = await readTranscriptionBody(request);
    const languageMode = normalizeTranscriptionLanguageMode(body.languageMode ?? meeting.language);
    // sanitizeKnownSpeakerNames filters out anything that looks like a
    // leaked reasoning label - a meeting whose speakerNames already picked
    // one up (before that filter existed, or from a run that slips past it)
    // would otherwise carry it forward forever: the save below only ever
    // unions in newly extracted names, it never removes anything, so a
    // clean re-transcription attempt that extracts nothing new (every line
    // uses a plain "Speaker N" label) leaves the old garbage untouched.
    const savedSpeakerNames = sanitizeKnownSpeakerNames(Array.isArray(meeting.speakerNames) ? meeting.speakerNames : []);
    const speakerNames = body.speakerNames.length ? body.speakerNames : savedSpeakerNames;
    const participantAudioSegments = meeting.transcriptSegments.filter((segment) => segment.audioUrl);
    const chronologicalSpeakerSegments = meeting.transcriptSegments.filter(
      (segment) => segment.text.trim() && !segment.audioUrl && segment.endMs > segment.startMs
    );
    // LiveKit server track segments are already sliced by time and carry the
    // registered participant name. Prefer those because they preserve both
    // the call roster and the spoken order. Per-participant full-call files
    // all start at 0ms, so concatenating those would group by person; mixed
    // audio stays as the fallback when timed track segments are unavailable.
    const shouldUseMixedAudio =
      Boolean(meeting.audioUrl) &&
      !chronologicalSpeakerSegments.length &&
      (!participantAudioSegments.length || speakerNames.length > participantAudioSegments.length);
    let rawTranscript = "";
    // Set when a long recording ran out of transcription budget partway
    // through its chunks - the transcript below is real but missing the
    // tail, so the response has to say so instead of presenting it as the
    // complete meeting.
    let incompleteLongRecording = false;
    let transcriptSpeakerNames = speakerNames;
    // Resolves each segment's label once here at assembly time: the real
    // registered name, or - for a participant who joined without typing one
    // - a generic "Speaker N" stable for that identity, so
    // detectSelfIntroducedSpeakerNames (inside refineSavedTranscript below)
    // still gets a chance to fill in their real name if they introduce
    // themselves in the audio. See createSegmentSpeakerLabelResolver.
    const resolveSegmentLabel = createSegmentSpeakerLabelResolver();

    if (chronologicalSpeakerSegments.length) {
      rawTranscript = chronologicalSpeakerSegments
        .sort((a, b) => a.startMs - b.startMs || a.segmentIndex - b.segmentIndex)
        .map((segment) => forceSingleSpeakerLabel(segment.text, resolveSegmentLabel(segment.speakerName, segment.speakerIdentity)))
        .join("\n");
      transcriptSpeakerNames = [
        ...new Set(
          chronologicalSpeakerSegments
            .map((segment) => segment.speakerName || segment.speakerIdentity)
            .filter((name) => !isPlaceholderParticipantName(name))
        )
      ];
    } else if (shouldUseMixedAudio && meeting.audioUrl) {
      const audioFile = await loadStoredAudioAsFile(meeting.audioUrl);
      if (audioFile.size < 1500) {
        return NextResponse.json(
          {
            error:
              "The saved audio file is too small or empty. Please record again and speak clearly near the microphone."
          },
          { status: 422 }
        );
      }
      rawTranscript = await withinDeadline(
        transcribeStoredTrackRecording(meeting.audioUrl, languageMode, transcriptionBudget(workDeadline), {
          speakerNames,
          singleSpeaker: false,
          onIncomplete: () => {
            incompleteLongRecording = true;
          }
        }),
        workDeadline - REFINE_RESERVE_MS
      );
    } else if (participantAudioSegments.length) {
      const parts = [];
      for (const segment of participantAudioSegments) {
        const speakerHint = segment.speakerName || segment.speakerIdentity;
        let text = segment.text.trim();
        const attemptTimeoutMs = transcriptionBudget(workDeadline);
        if (!text && attemptTimeoutMs >= MINIMUM_ATTEMPT_MS) {
          text = await withinDeadline(
            transcribeStoredTrackRecording(
              segment.audioUrl as string,
              languageMode,
              attemptTimeoutMs,
              { speakerNames: [speakerHint], singleSpeaker: true }
            ),
            workDeadline - REFINE_RESERVE_MS
          ).catch(() => "");
          // Stored as plain text, without a "Name:" prefix baked in - it is
          // applied once below via resolveSegmentLabel, which falls back to
          // a generic label instead of a placeholder display name.
          if (hasUsableTranscript(text)) {
            text = text.trim();
            await prisma.meetingTranscriptSegment.update({ where: { id: segment.id }, data: { text } }).catch(() => undefined);
          }
        }
        const speakerName = resolveSegmentLabel(segment.speakerName, segment.speakerIdentity);
        parts.push({
          startMs: segment.startMs,
          text: text.trim() ? forceSingleSpeakerLabel(text, speakerName) : ""
        });
      }
      rawTranscript = parts
        .filter((part) => part.text)
        .sort((a, b) => a.startMs - b.startMs)
        .map((part) => part.text)
        .join("\n");
      transcriptSpeakerNames = [
        ...new Set(
          participantAudioSegments
            .map((segment) => segment.speakerName || segment.speakerIdentity)
            .filter((name) => !isPlaceholderParticipantName(name))
        )
      ];
    } else if (meeting.audioUrl) {
      const audioFile = await loadStoredAudioAsFile(meeting.audioUrl);
      if (audioFile.size < 1500) {
        return NextResponse.json(
          {
            error:
              "The saved audio file is too small or empty. Please record again and speak clearly near the microphone."
          },
          { status: 422 }
        );
      }
      rawTranscript = await withinDeadline(
        transcribeStoredTrackRecording(meeting.audioUrl, languageMode, transcriptionBudget(workDeadline), {
          speakerNames,
          singleSpeaker: false,
          onIncomplete: () => {
            incompleteLongRecording = true;
          }
        }),
        workDeadline - REFINE_RESERVE_MS
      );
    }

    // The transcription model occasionally returns nothing usable for audio
    // it handles perfectly well on the next attempt - reproduced against
    // production, where a recording that had just failed for the owner
    // transcribed fine seconds later with no change to the audio, the key,
    // or the code. Rather than telling someone to go check their microphone
    // over a momentary miss, try once more while there is still budget.
    if (
      !hasUsableTranscript(rawTranscript) &&
      meeting.audioUrl &&
      transcriptionBudget(workDeadline) >= MINIMUM_ATTEMPT_MS
    ) {
      rawTranscript = await withinDeadline(
        transcribeStoredTrackRecording(meeting.audioUrl, languageMode, transcriptionBudget(workDeadline), {
          speakerNames,
          singleSpeaker: false,
          onIncomplete: () => {
            incompleteLongRecording = true;
          }
        }),
        workDeadline - REFINE_RESERVE_MS
      ).catch(() => rawTranscript);
    }

    const skippedPendingSegments =
      participantAudioSegments.length > 0 &&
      (participantAudioSegments.some((segment) => !segment.text.trim()) ||
        Date.now() > workDeadline - REFINE_RESERVE_MS - MINIMUM_ATTEMPT_MS);
    const refineBudget = workDeadline - Date.now() - FINALIZE_RESERVE_MS;
    const transcript = refineBudget >= 5000
      ? await refineSavedTranscript(rawTranscript, languageMode, transcriptSpeakerNames, refineBudget).catch(() => rawTranscript)
      : rawTranscript;

    if (!hasUsableTranscript(transcript)) {
      // Deliberately no longer leads with "check your microphone / credits":
      // the audio is already saved and was recorded fine, and the common
      // cause is the model simply returning nothing on this attempt - which
      // the retry above has just failed to shake off. Confirmed against
      // production that pressing the button again on the very same recording
      // succeeds, so that is what to tell people first. The old wording sent
      // the owner (and me) checking the microphone, the key and the credits
      // for a recording where none of those were the problem.
      const durationHint =
        meeting.duration && meeting.duration < 10
          ? " This recording is only a few seconds long, so there may not be enough speech in it."
          : "";
      return NextResponse.json(
        {
          error:
            `The AI did not return any text for this recording this time.${durationHint} Your audio is saved - please press Re-transcribe audio again, as this usually works on the next attempt. If it keeps failing, check that the recording actually has audible speech.`
        },
        { status: 422 }
      );
    }

    // The refine pass may detect additional real names, but it must never
    // shrink the roster captured when the call started. If AI only labels
    // three of four people, keep the fourth saved participant name.
    const finalSpeakerNames = extractRealSpeakerNamesFromTranscript(transcript);
    const speakerNamesToSave = [
      ...new Set([...transcriptSpeakerNames, ...finalSpeakerNames].map((name) => name.trim()).filter(Boolean))
    ].slice(0, 100);

    await prisma.meeting.update({
      where: { id },
      data: {
        transcript,
        summary: null,
        language: languageMode,
        status: "transcribed",
        speakerNames: speakerNamesToSave
      }
    });

    revalidatePath("/transcripts");
    revalidatePath("/summaries");
    revalidatePath("/dashboard");
    revalidatePath(`/meetings/${id}`);

    if (skippedPendingSegments) {
      return NextResponse.json({
        transcript,
        partial: true,
        message:
          "Saved every transcript segment captured so far. Some speaker audio may still need another pass; click Re-transcribe audio again to continue from the saved recording."
      });
    }

    if (incompleteLongRecording) {
      return NextResponse.json({
        transcript,
        partial: true,
        message:
          "This recording is long enough that transcription ran out of time before reaching the end, so the last part of the meeting is missing. The audio is saved in full - click Re-transcribe audio to continue."
      });
    }

    return NextResponse.json({ transcript });
  } catch (error) {
    const publicError = publicAiTranscriptionError(error);
    return NextResponse.json(
      { error: publicError.message },
      { status: publicError.status }
    );
  }
}

function transcriptionBudget(workDeadline: number) {
  const configured = Number(process.env.OPEN_ROUTER_SAVED_AUDIO_TIMEOUT_MS ?? 180000);
  return Math.max(1000, Math.min(configured, workDeadline - Date.now() - REFINE_RESERVE_MS));
}

async function withinDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("The transcription request timed out before it could finish.");

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("The transcription request timed out before it could finish.")),
          remaining
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readTranscriptionBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return { languageMode: undefined as unknown, speakerNames: [] as string[] };
  }

  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== "object") {
    return { languageMode: undefined as unknown, speakerNames: [] as string[] };
  }

  const rawSpeakerNames = "speakerNames" in body ? body.speakerNames : [];
  const speakerNames = Array.isArray(rawSpeakerNames)
    ? rawSpeakerNames
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter(Boolean)
        .slice(0, 100)
    : typeof rawSpeakerNames === "string"
      ? rawSpeakerNames
          .split(/[,，\n]/)
          .map((name) => name.trim())
          .filter(Boolean)
          .slice(0, 100)
      : [];

  return {
    languageMode: "languageMode" in body ? body.languageMode : undefined,
    speakerNames
  };
}
