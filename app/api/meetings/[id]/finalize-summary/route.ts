import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { extractMeetingSmartNote, extractMeetingTasks, generateMeetingSummary } from "@/lib/ai/openrouter";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { normalizeTranscriptionLanguageMode } from "@/lib/storage";
import { rateLimitResponse } from "@/lib/rate-limit";
import { meetingLiveRoom } from "@/lib/livekit-invite";
import { keepNewExtractedTasks } from "@/lib/ai/grounded-extraction";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    if (!meeting.transcript?.trim() || !hasUsableTranscript(meeting.transcript)) {
      return NextResponse.json({ error: "Transcript has no clear speech text yet." }, { status: 400 });
    }

    let summaryGenerated = false;
    let tasksCreated = 0;
    let aiError = "";
    const language = normalizeTranscriptionLanguageMode(meeting.language);

    try {
      const summary = await generateMeetingSummary(meeting.transcript, language);
      await prisma.meeting.update({
        where: { id },
        data: { summary, status: "summarized" }
      });
      summaryGenerated = true;
    } catch (error) {
      aiError = error instanceof Error ? error.message : "AI summary failed.";
    }

    try {
      const extracted = await extractMeetingTasks(meeting.transcript, language);
      const existing = await prisma.task.findMany({ where: { meetingId: id }, select: { title: true, sourceText: true } });
      const tasks = keepNewExtractedTasks(extracted, existing);
      if (tasks.length) {
        await prisma.task.createMany({
          data: tasks.map((task) => ({
            meetingId: id,
            title: task.title,
            description: task.description ?? null,
            assigneeName: task.assigneeName ?? null,
            deadline: task.deadline ? new Date(task.deadline) : null,
            priority: task.priority,
            status: task.status,
            sourceText: task.sourceText ?? null
          }))
        });
        tasksCreated = tasks.length;
      }
    } catch (error) {
      aiError = [aiError, error instanceof Error ? error.message : "AI task extraction failed."].filter(Boolean).join(" ");
    }

    try {
      const smartNote = await extractMeetingSmartNote(meeting.transcript, language);
      const liveRoom = meetingLiveRoom(meeting.smartNote);
      const existingDecisions = await prisma.decision.findMany({ where: { meetingId: id }, select: { title: true, sourceText: true } });
      const newDecisions = keepNewExtractedTasks(smartNote.decisions, existingDecisions);
      await prisma.$transaction([
        prisma.meeting.update({
          where: { id },
          data: { smartNote: {
            ...(liveRoom ? { liveRoom } : {}),
            problems: smartNote.problems,
            ideas: smartNote.ideas,
            questions: smartNote.questions
          } }
        }),
        ...(newDecisions.length
          ? [
              prisma.decision.createMany({
                data: newDecisions.map((decision) => ({
                  meetingId: id,
                  title: decision.title,
                  ownerName: decision.ownerName ?? null,
                  deadline: decision.deadline ? new Date(decision.deadline) : null,
                  sourceText: decision.sourceText ?? null
                }))
              })
            ]
          : [])
      ]);
    } catch (error) {
      aiError = [aiError, error instanceof Error ? error.message : "AI smart note extraction failed."].filter(Boolean).join(" ");
    }

    revalidatePath("/dashboard");
    revalidatePath("/meetings");
    revalidatePath("/transcripts");
    revalidatePath("/summaries");
    revalidatePath("/tasks");
    revalidatePath(`/meetings/${id}`);

    return NextResponse.json({ summaryGenerated, tasksCreated, aiError: aiError || null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not finalize meeting summary." },
      { status: 500 }
    );
  }
}
