import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { generateMeetingTimelineTopics } from "@/lib/ai/openrouter";
import { publicAiTranscriptionError } from "@/lib/api-error-messages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function formatTimestamp(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });

    const segments = await prisma.meetingTranscriptSegment.findMany({
      where: { meetingId: id },
      orderBy: { startMs: "asc" }
    });

    if (!segments.length) {
      return NextResponse.json(
        { error: "Timeline needs per-speaker timestamped segments, which only Server Rec recordings have." },
        { status: 400 }
      );
    }

    const input = segments.map((segment, index) => ({
      number: index + 1,
      timestamp: formatTimestamp(segment.startMs),
      speakerName: segment.speakerName || segment.speakerIdentity,
      text: segment.text
    }));

    const topics = await generateMeetingTimelineTopics(input);
    const timeline = topics.map((topic) => ({
      label: topic.label,
      startMs: segments[topic.segmentNumber - 1].startMs
    }));

    await prisma.meeting.update({ where: { id }, data: { timeline } });
    revalidatePath(`/meetings/${id}`);

    return NextResponse.json({ timeline });
  } catch (error) {
    const publicError = publicAiTranscriptionError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
