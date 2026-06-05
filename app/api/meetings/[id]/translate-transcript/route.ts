import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { translateMeetingTranscript, type TranscriptTranslationTarget } from "@/lib/ai/gemini";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { hasUsableTranscript } from "@/lib/transcript-quality";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const targetLanguage = normalizeTargetLanguage(body?.targetLanguage);
    const shouldSave = body?.save === true;
    const providedTranslation = typeof body?.translatedText === "string" ? body.translatedText.trim() : "";

    const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    if (!hasUsableTranscript(meeting.transcript ?? "")) {
      return NextResponse.json({ error: "Please add or transcribe a real transcript before translating." }, { status: 400 });
    }

    const translatedText = providedTranslation || (await translateMeetingTranscript(meeting.transcript ?? "", targetLanguage));
    if (!hasUsableTranscript(translatedText)) {
      return NextResponse.json({ error: "Translation did not return usable text. Please try again." }, { status: 422 });
    }

    if (shouldSave) {
      await prisma.$transaction([
        prisma.task.deleteMany({ where: { meetingId: id } }),
        prisma.meeting.update({
          where: { id },
          data: {
            transcript: translatedText,
            summary: null,
            language: targetLanguage === "km" ? "km" : "en",
            status: "transcribed"
          }
        })
      ]);
      revalidateMeetingViews(id);
    }

    return NextResponse.json({ translatedText, saved: shouldSave });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? sanitizeError(error.message) : "Could not translate transcript." },
      { status: 500 }
    );
  }
}

function normalizeTargetLanguage(value: unknown): TranscriptTranslationTarget {
  return value === "en" ? "en" : "km";
}

function revalidateMeetingViews(meetingId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/meetings");
  revalidatePath("/transcripts");
  revalidatePath("/summaries");
  revalidatePath("/tasks");
  revalidatePath(`/meetings/${meetingId}`);
}

function sanitizeError(message: string) {
  return message
    .replace(/key=AIza[0-9A-Za-z_-]+/g, "key=[hidden]")
    .replace(/AIza[0-9A-Za-z_-]+/g, "[hidden-api-key]")
    .slice(0, 500);
}
