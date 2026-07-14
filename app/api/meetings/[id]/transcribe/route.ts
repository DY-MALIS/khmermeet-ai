import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { loadStoredAudioAsFile, normalizeTranscriptionLanguageMode, transcribeAudio } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { publicAiTranscriptionError } from "@/lib/api-error-messages";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });

    if (!meeting) {
      return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    }

    if (!meeting.audioUrl) {
      return NextResponse.json({ error: "No audio file found for this meeting." }, { status: 400 });
    }

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

    const languageMode = await readLanguageMode(request, meeting.language);
    const transcript = await transcribeAudio(audioFile, [], languageMode, {
      timeoutMs: Number(process.env.OPEN_ROUTER_SAVED_AUDIO_TIMEOUT_MS ?? 240000)
    });

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

    await prisma.meeting.update({
      where: { id },
      data: {
        transcript,
        summary: null,
        language: "km-en",
        status: "transcribed"
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

async function readLanguageMode(request: Request, fallback: string | null) {
  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return normalizeTranscriptionLanguageMode(
      body && typeof body === "object" && "languageMode" in body ? body.languageMode : fallback
    );
  }
  return normalizeTranscriptionLanguageMode(fallback);
}
