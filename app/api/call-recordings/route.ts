import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { extractMeetingTasks, generateMeetingSummary } from "@/lib/ai/openai";

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save call recording." },
      { status: 500 }
    );
  }
}
