import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { loadStoredAudioAsFile, normalizeTranscriptionLanguageMode, transcribeAudio } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { publicGeminiTranscriptionError } from "@/lib/api-error-messages";

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
    const languageMode = await readLanguageMode(request, meeting.language);
    const transcript = await transcribeAudio(audioFile, [], languageMode, {
      timeoutMs: Number(process.env.GEMINI_SAVED_AUDIO_TIMEOUT_MS ?? 240000)
    });

    if (!hasUsableTranscript(transcript)) {
      return NextResponse.json(
        {
          error:
            "No clear speech text was detected. Please check the audio, microphone, or Gemini quota/key, then try again."
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
    const publicError = publicGeminiTranscriptionError(error);
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
