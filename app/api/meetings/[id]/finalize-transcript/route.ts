import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { isPlaceholderParticipantName, normalizeTranscriptionLanguageMode, refineSavedTranscript } from "@/lib/storage";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs the refine/cleanup pass (word spacing, punctuation) that live
// per-chunk transcription skips for latency - call this once after a
// recording's segments have all been transcribed, not per-chunk.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-generate");
    if (limited) return limited;
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, ...ownerWhere(user) } });
    if (!meeting) {
      return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    }
    if (!meeting.transcript?.trim()) {
      return NextResponse.json({ transcript: "", refined: false });
    }

    const languageMode = normalizeTranscriptionLanguageMode(meeting.language);
    const segments = await prisma.meetingTranscriptSegment.findMany({
      where: { meetingId: id },
      select: { speakerName: true }
    });
    const trustedSpeakerNames = [
      ...new Set((segments.length
        ? segments.map((segment) => segment.speakerName ?? "")
        : meeting.speakerNames ?? []).filter((name) => !isPlaceholderParticipantName(name)))
    ];
    const refined = await refineSavedTranscript(meeting.transcript, languageMode, trustedSpeakerNames);

    if (refined.trim() && refined.trim() !== meeting.transcript.trim()) {
      await prisma.meeting.update({
        where: { id },
        data: { transcript: refined, summary: null, speakerNames: trustedSpeakerNames }
      });
    }

    revalidatePath("/transcripts");
    revalidatePath("/summaries");
    revalidatePath("/dashboard");
    revalidatePath(`/meetings/${id}`);

    return NextResponse.json({ transcript: refined, refined: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not finalize transcript." },
      { status: 500 }
    );
  }
}
