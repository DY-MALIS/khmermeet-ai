import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { extractMeetingTasks, generateMeetingSummary } from "@/lib/ai/openrouter";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { normalizeTranscriptionLanguageMode } from "@/lib/storage";
import { clampMeetingDurationSeconds } from "@/lib/meeting-duration";

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
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const title = cleanString(body.title) || "Uploaded meeting";
    const audioUrl = cleanString(body.audioUrl);
    const rawTranscript = cleanString(body.transcript);
    const duration = clampMeetingDurationSeconds(body.duration);
    const transcript = hasUsableTranscript(rawTranscript) ? rawTranscript : "";
    const languageMode = normalizeTranscriptionLanguageMode(body.languageMode);
    const rawSpeakerNames: unknown[] = Array.isArray(body.speakerNames) ? body.speakerNames : [];
    const speakerNames = rawSpeakerNames
          .filter((speaker: unknown): speaker is string => typeof speaker === "string")
          .map((speaker) => speaker.trim())
          .filter(Boolean)
          .slice(0, 100);

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
      language: languageMode,
      status: transcript ? "transcribed" : "recorded",
      duration,
      speakerNames,
      createdById: user.id
    }
  });

    if (transcript) {
    try {
      const summary = await generateMeetingSummary(transcript, languageMode);
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { summary, status: "summarized" }
      });
    } catch {
      // Keep the uploaded meeting saved even if the AI provider is unavailable.
    }

    try {
      const tasks = await extractMeetingTasks(transcript, languageMode);
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
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
    return NextResponse.json(
      {
        error: "Could not save the meeting because the database is unavailable.",
        code,
        hint: "Check Vercel DATABASE_URL, Supabase status, and Prisma migration. The uploaded file was not intentionally deleted."
      },
      { status: 503 }
    );
  }
}
