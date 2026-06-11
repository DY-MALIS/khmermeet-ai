import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizeTranscriptionLanguageMode, transcribeAudio } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });

    if (!meeting) {
      return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("audio");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing audio chunk." }, { status: 400 });
    }

    const languageMode = normalizeTranscriptionLanguageMode(formData.get("languageMode"));
    const speakersField = formData.get("speakers");
    const speakerNames = typeof speakersField === "string" ? parseSpeakerNames(speakersField) : [];
    const index = Number(formData.get("index") ?? 0);
    const transcript = await transcribeAudio(file, speakerNames, languageMode, {
      mode: "live",
      timeoutMs: 25000
    });

    if (!hasUsableTranscript(transcript)) {
      return NextResponse.json({ transcript: "", skipped: true, index });
    }

    const existing = meeting.transcript?.trim();
    const nextTranscript = [existing, transcript.trim()].filter(Boolean).join("\n");

    await prisma.meeting.update({
      where: { id },
      data: {
        transcript: nextTranscript,
        summary: null,
        language: "km-en",
        status: "transcribed"
      }
    });

    revalidatePath("/transcripts");
    revalidatePath("/summaries");
    revalidatePath("/dashboard");
    revalidatePath(`/meetings/${id}`);

    return NextResponse.json({ transcript, index });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? sanitizeError(error.message) : "Could not transcribe audio chunk." },
      { status: 500 }
    );
  }
}

function sanitizeError(message: string) {
  return message
    .replace(/key=AIza[0-9A-Za-z_-]+/g, "key=[hidden]")
    .replace(/AIza[0-9A-Za-z_-]+/g, "[hidden-api-key]")
    .slice(0, 500);
}

function parseSpeakerNames(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((speaker): speaker is string => typeof speaker === "string")
      .map((speaker) => speaker.trim())
      .filter(Boolean)
      .slice(0, 20);
  } catch {
    return [];
  }
}
