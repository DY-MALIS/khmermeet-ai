import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { extractSelfIntroducedSpeakerNames, forceSingleSpeakerLabel, loadStoredAudioAsFile, normalizeTranscriptionLanguageMode, refineSavedTranscript, transcribeStoredTrackRecording } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { publicAiTranscriptionError } from "@/lib/api-error-messages";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const shouldUseMixedAudio =
      Boolean(meeting.audioUrl) &&
      (!participantAudioSegments.length || participantAudioSegments.length < 2 || speakerNames.length > participantAudioSegments.length);
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
      rawTranscript = await transcribeStoredTrackRecording(meeting.audioUrl, languageMode, Number(process.env.OPEN_ROUTER_SAVED_AUDIO_TIMEOUT_MS ?? 180000), {
        speakerNames,
        singleSpeaker: false
      });
    } else if (participantAudioSegments.length) {
      const parts = await Promise.all(
        participantAudioSegments.map(async (segment) => {
          const speakerName = segment.speakerName || segment.speakerIdentity;
          const text = await transcribeStoredTrackRecording(
            segment.audioUrl as string,
            languageMode,
            Number(process.env.OPEN_ROUTER_SAVED_AUDIO_TIMEOUT_MS ?? 180000),
            { speakerNames: [speakerName], singleSpeaker: true }
          ).catch(() => "");
          return {
            startMs: segment.startMs,
            text: text.trim() ? forceSingleSpeakerLabel(text, speakerName) : ""
          };
        })
      );
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
      rawTranscript = await transcribeStoredTrackRecording(meeting.audioUrl, languageMode, Number(process.env.OPEN_ROUTER_SAVED_AUDIO_TIMEOUT_MS ?? 180000), {
        speakerNames,
        singleSpeaker: false
      });
    }

    const transcript = await refineSavedTranscript(rawTranscript, languageMode, transcriptSpeakerNames).catch(() => rawTranscript);

    if (!hasUsableTranscript(transcript)) {
      const durationHint =
        meeting.duration && meeting.duration < 10
          ? " This recording is very short, so the AI may not have enough speech to transcribe."
          : "";
      return NextResponse.json(
        {
          error:
            `The AI could not transcribe clear speech from this attempt.${durationHint} This can happen even with valid audio when the transcription provider returns an empty result. Please try again, or check the selected language and OpenRouter status if it keeps happening.`
        },
        { status: 422 }
      );
    }

    const introducedSpeakerNames = extractSelfIntroducedSpeakerNames(transcript);
    const nextSpeakerNames = [
      ...new Set([...transcriptSpeakerNames, ...introducedSpeakerNames].map((name) => name.trim()).filter(Boolean))
    ].slice(0, 100);

    await prisma.meeting.update({
      where: { id },
      data: {
        transcript,
        summary: null,
        language: languageMode,
        status: "transcribed",
        speakerNames: nextSpeakerNames
      }
    });

    revalidatePath("/transcripts");
    revalidatePath("/summaries");
    revalidatePath("/dashboard");
    revalidatePath(`/meetings/${id}`);

    return NextResponse.json({ transcript });
  } catch (error) {
    const publicError = publicAiTranscriptionError(error);
    return NextResponse.json(
      { error: publicError.message },
      { status: publicError.status }
    );
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
