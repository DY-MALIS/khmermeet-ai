import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { extractMeetingTasks, generateMeetingSummary } from "@/lib/ai/gemini";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { hasUsableTranscript } from "@/lib/transcript-quality";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function revalidateMeetingViews(meetingId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/meetings");
  revalidatePath("/meetings/new");
  revalidatePath("/transcripts");
  revalidatePath("/summaries");
  revalidatePath("/tasks");
  revalidatePath(`/meetings/${meetingId}`);
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const title = cleanString(body.title) || "Uploaded meeting";
  const audioUrl = cleanString(body.audioUrl);
  const rawTranscript = cleanString(body.transcript);
  const duration = Number(body.duration ?? 0);
  const transcript = hasUsableTranscript(rawTranscript) ? rawTranscript : "";

  if (!audioUrl) {
    return NextResponse.json({ error: "Missing uploaded audio or video URL." }, { status: 400 });
  }

  await prisma.user.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      name: user.name ?? "Local Demo",
      email: user.email ?? "demo@khmermeet.ai",
      passwordHash: "local-no-login"
    }
  });

  const meeting = await prisma.meeting.create({
    data: {
      title,
      audioUrl,
      transcript: transcript || null,
      summary: null,
      language: transcript ? "km-en" : "km",
      status: transcript ? "transcribed" : "recorded",
      duration: Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0,
      createdById: user.id
    }
  });

  if (transcript) {
    try {
      const summary = await generateMeetingSummary(transcript);
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { summary, status: "summarized" }
      });
    } catch {
      // Keep the uploaded meeting saved even if Gemini is unavailable.
    }

    try {
      const tasks = await extractMeetingTasks(transcript);
      if (tasks.length) {
        await prisma.task.createMany({
          data: tasks.map((task) => ({
            meetingId: meeting.id,
            title: task.title,
            description: task.description ?? null,
            assigneeName: task.assigneeName ?? null,
            deadline: task.deadline ? new Date(task.deadline) : null,
            priority: task.priority,
            status: task.status,
            sourceText: task.sourceText ?? null
          }))
        });
      }
    } catch {
      // Tasks can be generated later from the meeting detail page.
    }
  }

  revalidateMeetingViews(meeting.id);
  return NextResponse.json({ id: meeting.id });
}
