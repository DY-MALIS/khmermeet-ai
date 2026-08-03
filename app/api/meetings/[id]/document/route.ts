import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { generateMeetingDocument } from "@/lib/ai/openrouter";
import type { MeetingDocumentType } from "@/lib/ai/prompts/documentPrompt";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { publicAiTranscriptionError } from "@/lib/api-error-messages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const documentTypes: MeetingDocumentType[] = ["minutes", "proposal", "project_plan", "report", "sop", "contract_draft"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    if (!meeting.transcript?.trim() || !hasUsableTranscript(meeting.transcript)) {
      return NextResponse.json({ error: "Transcript has no clear speech text yet." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const type = body?.type;
    if (typeof type !== "string" || !documentTypes.includes(type as MeetingDocumentType)) {
      return NextResponse.json({ error: "Invalid document type." }, { status: 400 });
    }

    const document = await generateMeetingDocument(type as MeetingDocumentType, meeting.title, meeting.transcript, meeting.summary);
    return NextResponse.json({ document });
  } catch (error) {
    const publicError = publicAiTranscriptionError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
