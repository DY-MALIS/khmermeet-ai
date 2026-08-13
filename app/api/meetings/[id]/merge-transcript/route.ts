import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizeTranscriptionLanguageMode, refineSavedTranscript } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
    if (!meeting) {
      return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    }

    const segments = await prisma.meetingTranscriptSegment.findMany({
      where: { meetingId: id },
      orderBy: [{ startMs: "asc" }, { segmentIndex: "asc" }, { id: "asc" }]
    });
    if (!segments.length) {
      return NextResponse.json({ transcript: "", merged: false });
    }

    const rawTranscript = segments.map((segment) => `${segment.speakerName || segment.speakerIdentity}: ${segment.text}`).join("\n");
    let transcript = rawTranscript;
    if (hasUsableTranscript(rawTranscript)) {
      // Each segment was transcribed live (mode:"live"), which skips the
      // refine/cleanup pass for latency - raw Khmer STT output comes back
      // with every syllable space-separated instead of properly joined
      // words. One refine pass now that all segments are merged, same as
      // recording-panel.tsx's finalize-transcript step.
      const speakerNames = [...new Set(segments.map((segment) => segment.speakerName || segment.speakerIdentity))];
      const languageMode = normalizeTranscriptionLanguageMode(meeting.language);
      transcript = await refineSavedTranscript(rawTranscript, languageMode, speakerNames).catch(() => rawTranscript);
      // Don't overwrite `language` here: segments were already transcribed
      // using the language mode the user picked when recording, set on the
      // meeting when it was created. Forcing "km-en" here discarded that
      // choice and made summary/task generation ignore it downstream.
      await prisma.meeting.update({
        where: { id },
        data: { transcript, summary: null, status: "transcribed" }
      });
    }

    revalidatePath("/transcripts");
    revalidatePath("/summaries");
    revalidatePath("/dashboard");
    revalidatePath(`/meetings/${id}`);

    return NextResponse.json({ transcript, merged: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not merge transcript segments." },
      { status: 500 }
    );
  }
}
