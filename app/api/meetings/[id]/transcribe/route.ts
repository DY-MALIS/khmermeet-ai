import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import {
  extractRealSpeakerNamesFromTranscript,
  forceSingleSpeakerLabel,
  loadStoredAudioAsFile,
  normalizeTranscriptionLanguageMode,
  refineSavedTranscript,
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
          where: { audioUrl: { not: null } },
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
    const savedSpeakerNames = Array.isArray(meeting.speakerNames) ? meeting.speakerNames : [];
    const speakerNames = body.speakerNames.length ? body.speakerNames : savedSpeakerNames;
    const participantAudioSegments = meeting.transcriptSegments.filter((segment) => segment.audioUrl);
    // Per-participant recordings all start at 0ms, so concatenating them
    // groups the transcript by person. Use the mixed backup whenever it is
    // available for a multi-speaker meeting so turns stay chronological.
    const shouldUseMixedAudio =
      Boolean(meeting.audioUrl) &&
      (!participantAudioSegments.length || participantAudioSegments.length > 1 || speakerNames.length > participantAudioSegments.length);
    let rawTranscript = "";
    let transcriptSpeakerNames = speakerNames;

    if (shouldUseMixedAudio && meeting.audioUrl) {
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
          singleSpeaker: false
        }),
        workDeadline - REFINE_RESERVE_MS
      );
    } else if (participantAudioSegments.length) {
      const parts = [];
      for (const segment of participantAudioSegments) {
        const speakerName = segment.speakerName || segment.speakerIdentity;
        let text = segment.text.trim();
        const attemptTimeoutMs = transcriptionBudget(workDeadline);
        if (!text && attemptTimeoutMs >= MINIMUM_ATTEMPT_MS) {
          text = await withinDeadline(
            transcribeStoredTrackRecording(
              segment.audioUrl as string,
              languageMode,
              attemptTimeoutMs,
              { speakerNames: [speakerName], singleSpeaker: true }
            ),
            workDeadline - REFINE_RESERVE_MS
          ).catch(() => "");
          if (hasUsableTranscript(text)) {
            text = forceSingleSpeakerLabel(text, speakerName).trim();
            await prisma.meetingTranscriptSegment.update({ where: { id: segment.id }, data: { text } }).catch(() => undefined);
          }
        }
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
      transcriptSpeakerNames = [...new Set(participantAudioSegments.map((segment) => segment.speakerName || segment.speakerIdentity))];
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
          singleSpeaker: false
        }),
        workDeadline - REFINE_RESERVE_MS
      );
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
      const durationHint =
        meeting.duration && meeting.duration < 10
          ? " This recording is very short, so the AI may not have enough speech to transcribe."
          : "";
      return NextResponse.json(
        {
          error:
            `No clear speech text was detected.${durationHint} Please check the audio volume, microphone, selected language, and OpenRouter credits/key, then try again.`
        },
        { status: 422 }
      );
    }

    // The refine pass may have auto-detected and applied real names for
    // speakers who introduced themselves even though none were typed in
    // (see detectSelfIntroducedSpeakerNames) - reading them back from the
    // final transcript text keeps the saved speaker list in sync with what
    // the transcript actually says.
    const finalSpeakerNames = extractRealSpeakerNamesFromTranscript(transcript);
    const speakerNamesToSave = finalSpeakerNames.length ? finalSpeakerNames : transcriptSpeakerNames;

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
