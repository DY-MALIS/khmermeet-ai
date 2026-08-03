import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { generateFollowUpEmail } from "@/lib/ai/openrouter";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { publicAiTranscriptionError } from "@/lib/api-error-messages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    if (!meeting.transcript?.trim() || !hasUsableTranscript(meeting.transcript)) {
      return NextResponse.json({ error: "Transcript has no clear speech text yet." }, { status: 400 });
    }

    const email = await generateFollowUpEmail(meeting.title, meeting.transcript, meeting.summary);
    return NextResponse.json({ email });
  } catch (error) {
    const publicError = publicAiTranscriptionError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
