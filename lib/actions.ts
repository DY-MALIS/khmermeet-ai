"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { extractMeetingTasks, generateMeetingSummary } from "@/lib/ai/openrouter";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { deleteStoredAudio, loadStoredAudioAsFile, normalizeTranscriptionLanguageMode, transcribeAudio } from "@/lib/storage";

type TaskPriority = "low" | "medium" | "high";
type TaskStatus = "not_started" | "in_progress" | "completed";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateMeetingViews(meetingId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/meetings");
  revalidatePath("/meetings/new");
  revalidatePath("/transcripts");
  revalidatePath("/summaries");
  revalidatePath("/tasks");
  if (meetingId) revalidatePath(`/meetings/${meetingId}`);
}

export async function registerUser(formData: FormData) {
  const name = formString(formData, "name");
  const email = formString(formData, "email").toLowerCase();
  const password = formString(formData, "password");
  if (!name || !email || password.length < 6) throw new Error("Please enter name, email, and a 6+ character password.");
  await prisma.user.create({ data: { name, email, passwordHash: await hash(password, 10) } });
  redirect("/dashboard");
}

export async function getMeetings() {
  const user = await requireUser();
  return prisma.meeting.findMany({
    where: { createdById: user.id },
    include: { tasks: true },
    orderBy: { createdAt: "desc" }
  });
}

export async function getMeetingById(id: string) {
  const user = await requireUser();
  return prisma.meeting.findFirst({
    where: { id, createdById: user.id },
    include: {
      tasks: { orderBy: { createdAt: "desc" } },
      decisions: { orderBy: { createdAt: "desc" } },
      transcriptSegments: { select: { id: true }, take: 1 }
    }
  });
}

export async function updateTranscript(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const transcript = formString(formData, "transcript");
  if (!transcript) throw new Error("Transcript is empty.");
  if (!hasUsableTranscript(transcript)) throw new Error("Transcript has no clear speech text. Please re-transcribe or paste the correct meeting text.");
  const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
  if (!meeting) throw new Error("No meeting found.");
  await prisma.$transaction([
    prisma.task.deleteMany({ where: { meetingId: id } }),
    prisma.meeting.update({
      where: { id },
      data: { transcript, summary: null, status: "transcribed" }
    })
  ]);
  revalidateMeetingViews(id);
}

export async function transcribeMeetingAudio(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
  if (!meeting) throw new Error("No meeting found.");
  if (!meeting.audioUrl) throw new Error("No audio file found for this meeting.");

  const audioFile = await loadStoredAudioAsFile(meeting.audioUrl);
  const transcript = await transcribeAudio(audioFile);
  if (!hasUsableTranscript(transcript)) {
    throw new Error("No clear speech text was detected. Please check the audio, microphone, or OpenRouter credits/key.");
  }

  await prisma.meeting.update({
    where: { id },
    data: {
      transcript,
      summary: null,
      language: "km-en",
      status: "transcribed"
    }
  });
  revalidateMeetingViews(id);
}

export async function generateSummary(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
  if (!meeting) throw new Error("No meeting found.");
  if (!meeting.transcript?.trim()) throw new Error("Transcript is empty.");
  if (!hasUsableTranscript(meeting.transcript)) throw new Error("Transcript has no clear speech text. Please re-transcribe or paste the correct meeting text before summarizing.");
  const summary = await generateMeetingSummary(meeting.transcript, normalizeTranscriptionLanguageMode(meeting.language));
  await prisma.meeting.update({ where: { id }, data: { summary, status: "summarized" } });
  revalidateMeetingViews(id);
}

export async function extractTasks(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
  if (!meeting) throw new Error("No meeting found.");
  if (!meeting.transcript?.trim()) throw new Error("Transcript is empty.");
  if (!hasUsableTranscript(meeting.transcript)) throw new Error("Transcript has no clear speech text. Please re-transcribe or paste the correct meeting text before extracting tasks.");
  const tasks = await extractMeetingTasks(meeting.transcript, normalizeTranscriptionLanguageMode(meeting.language));
  await prisma.$transaction([
    prisma.task.deleteMany({ where: { meetingId: id } }),
    ...(tasks.length
      ? [
          prisma.task.createMany({
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
          })
        ]
      : [])
  ]);
  revalidateMeetingViews(id);
}

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const meetingId = formString(formData, "meetingId");
  const title = formString(formData, "title");
  const priority = formString(formData, "priority") || "medium";
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, createdById: user.id } });
  if (!meeting) throw new Error("No meeting found.");
  if (!title) throw new Error("Task title is required.");
  if (!["low", "medium", "high"].includes(priority)) throw new Error("Invalid task priority.");
  await prisma.task.create({
    data: {
      meetingId,
      title,
      description: formString(formData, "description") || null,
      assigneeName: formString(formData, "assigneeName") || null,
      deadline: formString(formData, "deadline") ? new Date(formString(formData, "deadline")) : null,
      priority: priority as TaskPriority
    }
  });
  revalidateMeetingViews(meetingId);
}

export async function updateTask(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const task = await prisma.task.findFirst({ where: { id, meeting: { createdById: user.id } } });
  if (!task) throw new Error("No task found.");
  const status = formString(formData, "status") as TaskStatus;
  if (!["not_started", "in_progress", "completed"].includes(status)) throw new Error("Invalid task status.");
  const assigneeName = formString(formData, "assigneeName") || null;
  const deadlineText = formString(formData, "deadline");
  await prisma.task.update({
    where: { id },
    data: {
      status,
      assigneeName,
      deadline: deadlineText ? new Date(deadlineText) : null
    }
  });
  revalidateMeetingViews(task.meetingId);
}

export async function deleteTask(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const task = await prisma.task.findFirst({ where: { id, meeting: { createdById: user.id } } });
  if (!task) throw new Error("No task found.");
  await prisma.task.delete({ where: { id } });
  revalidateMeetingViews(task.meetingId);
}

export async function deleteMeeting(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
  if (!meeting) throw new Error("No meeting found.");
  await prisma.meeting.delete({ where: { id } });
  await deleteStoredAudio(meeting.audioUrl).catch(() => undefined);
  revalidateMeetingViews(id);
}

