import path from "path";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { downloadSupabaseAudio, normalizeTranscriptionLanguageMode, transcribeAudio } from "@/lib/storage";
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

    const body = await request.json().catch(() => ({}));
    const objectPath = typeof body.objectPath === "string" ? body.objectPath.trim() : "";
    if (!objectPath.startsWith("livekit-egress/") || objectPath.includes("..")) {
      return NextResponse.json({ error: "Invalid segment path." }, { status: 400 });
    }
    const index = Number(body.index ?? 0);
    const languageMode = normalizeTranscriptionLanguageMode(body.languageMode);

    const { data, mimeType } = await downloadSupabaseAudio(objectPath);
    const file = new File([data], path.basename(objectPath), { type: mimeType });

    const savedSpeakerNames = Array.isArray(meeting.speakerNames) ? meeting.speakerNames : [];
    const transcript = await transcribeAudio(file, savedSpeakerNames, languageMode, {
      mode: "live",
      timeoutMs: 45000
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
      { error: error instanceof Error ? sanitizeError(error.message) : "Could not transcribe audio segment." },
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
