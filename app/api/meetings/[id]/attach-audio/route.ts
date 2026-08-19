import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizeTranscriptionLanguageMode } from "@/lib/storage";
import { clampMeetingDurationSeconds } from "@/lib/meeting-duration";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl.trim() : "";
    if (!audioUrl) return NextResponse.json({ error: "audioUrl is required." }, { status: 400 });

    const duration = "duration" in body ? clampMeetingDurationSeconds(body.duration) : undefined;
    const languageMode = normalizeTranscriptionLanguageMode(body.languageMode);
    const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });

    await prisma.meeting.update({
      where: { id },
      data: {
        audioUrl,
        language: languageMode,
        duration: duration ?? meeting.duration,
        status: meeting.status === "recording" ? "recorded" : meeting.status
      }
    });

    revalidatePath("/meetings");
    revalidatePath("/meetings/new");
    revalidatePath("/transcripts");
    revalidatePath(`/meetings/${id}`);

    return NextResponse.json({ attached: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not attach audio to the meeting." },
      { status: 500 }
    );
  }
}
