import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { extractMeetingTasks, generateMeetingSummary } from "@/lib/ai/openai";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Video call meeting";
    const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
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

    const summary = transcript ? await generateMeetingSummary(transcript) : null;
    const meeting = await prisma.meeting.create({
      data: {
        title,
        audioUrl,
        transcript: transcript || null,
        summary,
        duration,
        language: "km",
        status: transcript ? "summarized" : "recorded",
        createdById: user.id
      }
    });

    if (transcript) {
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
    }

    return NextResponse.json({ meetingId: meeting.id });
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
            ? "Vercel មិនរក្សា SQLite/local uploads ជាអចិន្ត្រៃយ៍ទេ។ សូមដាក់ production PostgreSQL DATABASE_URL និង OPENAI_API_KEY ក្នុង Vercel Environment Variables។"
            : undefined
      },
      { status: 500 }
    );
  }
}
