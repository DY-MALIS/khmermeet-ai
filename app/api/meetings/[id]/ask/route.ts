import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { answerMeetingQuestion } from "@/lib/ai/openrouter";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { publicAiTranscriptionError } from "@/lib/api-error-messages";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-generate");
    if (limited) return limited;
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    if (!meeting.transcript?.trim() || !hasUsableTranscript(meeting.transcript)) {
      return NextResponse.json({ error: "Transcript has no clear speech text yet." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const question = typeof body?.question === "string" ? body.question.trim().slice(0, 500) : "";
    if (!question) return NextResponse.json({ error: "Question is required." }, { status: 400 });

    const result = await answerMeetingQuestion(meeting.transcript, question);

    let startMs: number | null = null;
    if (result.quote) {
      const segments = await prisma.meetingTranscriptSegment.findMany({
        where: { meetingId: id },
        orderBy: { startMs: "asc" }
      });
      const needle = normalize(result.quote);
      const match = segments.find((segment) => needle.length > 0 && normalize(segment.text).includes(needle.slice(0, Math.min(needle.length, 60))));
      if (match) startMs = match.startMs;
    }

    return NextResponse.json({ answer: result.answer, quote: result.quote, speakerName: result.speakerName, startMs });
  } catch (error) {
    const publicError = publicAiTranscriptionError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
