import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { normalizeTranscriptionLanguageMode } from "@/lib/storage";
import { clampMeetingDurationSeconds } from "@/lib/meeting-duration";
import { listLiveKitParticipantNames } from "@/lib/livekit-egress";

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
    const room = typeof body.room === "string" ? body.room.trim() : "";
    const liveKitSpeakerNames = room ? await listLiveKitParticipantNames(room).catch(() => []) : [];
    const speakerNames = normalizeSpeakerNames([...normalizeSpeakerNames(body.speakerNames), ...liveKitSpeakerNames]);
    const meeting = await prisma.meeting.findFirst({ where: { id, ...ownerWhere(user) } });
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    const nextSpeakerNames = [
      ...new Set([...(meeting.speakerNames ?? []), ...speakerNames].map((name) => name.trim()).filter(Boolean))
    ].slice(0, 100);

    await prisma.meeting.update({
      where: { id },
      data: {
        audioUrl,
        language: languageMode,
        duration: duration ?? meeting.duration,
        speakerNames: nextSpeakerNames,
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

function normalizeSpeakerNames(value: unknown) {
  const rawNames = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,，\n]/)
      : [];

  return [
    ...new Set(
      rawNames
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter(Boolean)
    )
  ].slice(0, 100);
}
