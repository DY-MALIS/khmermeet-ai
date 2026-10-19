import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { backfillVoicesFromEarlierCalls, recogniseMixedRecordingSpeakers } from "@/lib/voice/memory";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-transcribe");
    if (limited) return limited;
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({
      where: { id, ...ownerWhere(user) },
      select: { audioUrl: true, transcript: true, speakerNames: true, duration: true }
    });
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    if (!meeting.audioUrl || !meeting.transcript) return NextResponse.json({ transcript: meeting.transcript ?? "", matched: 0 });
    if (meeting.duration > 15 * 60) {
      return NextResponse.json({
        transcript: meeting.transcript,
        matched: 0,
        message: "This recording is too long to safely match Speaker numbers across audio chunks; generic labels were kept."
      });
    }

    let rememberedCount = await prisma.voiceSample.count({ where: { ownerId: user.id } });
    if (!rememberedCount) {
      await backfillVoicesFromEarlierCalls(user.id, id);
      rememberedCount = await prisma.voiceSample.count({ where: { ownerId: user.id } });
    }
    if (!rememberedCount) {
      return NextResponse.json({
        transcript: meeting.transcript,
        matched: 0,
        message: "No saved voiceprints are available yet. Earlier speaker names alone are not voice samples."
      });
    }

    const matches = await recogniseMixedRecordingSpeakers(user.id, meeting.audioUrl, meeting.transcript);
    if (!matches.size) return NextResponse.json({ transcript: meeting.transcript, matched: 0, message: "No remembered voice matched confidently; generic speaker labels were kept." });
    const transcript = meeting.transcript.replace(/^(\s*)(Speaker\s+\d+|Woman|Man|Female|Male)\s*:/gim, (line, leading: string, label: string) =>
      matches.has(label) ? `${leading}${matches.get(label)}:` : line
    );
    // A user may edit the transcript while recognition runs. Never overwrite
    // newer text with a result based on the earlier version.
    const updated = await prisma.meeting.updateMany({
      where: { id, ...ownerWhere(user), transcript: meeting.transcript },
      data: { transcript, speakerNames: [...new Set([...meeting.speakerNames, ...matches.values()])] }
    });
    if (!updated.count) return NextResponse.json({ transcript: meeting.transcript, matched: 0 });
    revalidatePath(`/meetings/${id}`);
    revalidatePath("/transcripts");
    return NextResponse.json({ transcript, matched: matches.size });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not recognize speakers." }, { status: 500 });
  }
}
