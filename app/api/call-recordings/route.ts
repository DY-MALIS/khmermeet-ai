import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { extractMeetingTasks, generateMeetingSummary } from "@/lib/ai/gemini";
import { hasUsableTranscript } from "@/lib/transcript-quality";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Video call meeting";
    const rawTranscript = typeof body.transcript === "string" ? body.transcript.trim() : "";
    const transcript = hasUsableTranscript(rawTranscript) ? rawTranscript : "";
    const audioUrl = typeof body.audioUrl === "string" && body.audioUrl.trim() ? body.audioUrl.trim() : null;
    const duration = Number.isFinite(Number(body.duration)) ? Number(body.duration) : 0;

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
        duration,
        language: "km-en",
        status: transcript ? "transcribed" : "recorded",
        createdById: user.id
      }
    });

    let summaryGenerated = false;
    let tasksCreated = 0;
    let aiError = "";

    if (transcript) {
      try {
        const summary = await generateMeetingSummary(transcript);
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: { summary, status: "summarized" }
        });
        summaryGenerated = true;
      } catch (error) {
        aiError = error instanceof Error ? error.message : "AI summary failed.";
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
          tasksCreated = tasks.length;
        }
      } catch (error) {
        aiError = [aiError, error instanceof Error ? error.message : "AI task extraction failed."].filter(Boolean).join(" ");
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/meetings");
    revalidatePath("/transcripts");
    revalidatePath("/summaries");
    revalidatePath("/tasks");
    revalidatePath(`/meetings/${meeting.id}`);

    return NextResponse.json({ meetingId: meeting.id, summaryGenerated, tasksCreated, aiError: aiError || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save call recording.";
    const isVercel = Boolean(process.env.VERCEL);
    const isDatabaseError =
      message.toLowerCase().includes("database") ||
      message.toLowerCase().includes("prisma") ||
      message.toLowerCase().includes("sqlite") ||
      message.toLowerCase().includes("readonly") ||
      message.toLowerCase().includes("unable to open");

    return NextResponse.json(
      {
        error:
          isVercel && isDatabaseError
            ? "Database មិនទាន់ត្រូវបាន configure សម្រាប់ Vercel ទេ។ សូមប្រើ PostgreSQL/Supabase/Neon DATABASE_URL ជំនួស SQLite local file។"
            : message,
        hint:
          isVercel
            ? "Vercel មិនរក្សា SQLite/local uploads ជាអចិន្ត្រៃយ៍ទេ។ សូមដាក់ production PostgreSQL DATABASE_URL និង GEMINI_API_KEY ក្នុង Vercel Environment Variables។"
            : undefined
      },
      { status: 500 }
    );
  }
}
