"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { extractMeetingTasks, generateMeetingSummary } from "@/lib/ai/gemini";

type TaskPriority = "low" | "medium" | "high";
type TaskStatus = "not_started" | "in_progress" | "completed";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateMeetingViews(meetingId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/meetings");
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

export async function createMeeting(formData: FormData) {
  const user = await requireUser();
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
  const title = formString(formData, "title") || "Untitled meeting";
  const audioUrl = formString(formData, "audioUrl") || null;
  const transcript = formString(formData, "transcript");
  const duration = Number(formData.get("duration") ?? 0);
  const meeting = await prisma.meeting.create({
    data: {
      title,
      audioUrl,
      transcript: transcript || null,
      summary: null,
      language: transcript ? "km-en" : "km",
      status: transcript ? "transcribed" : "recorded",
      duration: Number.isFinite(duration) ? duration : 0,
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
      // Keep the meeting saved even if Gemini quota/billing is unavailable.
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
  redirect(`/meetings/${meeting.id}`);
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
    include: { tasks: { orderBy: { createdAt: "desc" } } }
  });
}

export async function updateTranscript(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const transcript = formString(formData, "transcript");
  if (!transcript) throw new Error("Transcript is empty.");
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

export async function generateSummary(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
  if (!meeting) throw new Error("No meeting found.");
  if (!meeting.transcript?.trim()) throw new Error("Transcript is empty.");
  const summary = await generateMeetingSummary(meeting.transcript);
  await prisma.meeting.update({ where: { id }, data: { summary, status: "summarized" } });
  revalidateMeetingViews(id);
}

export async function extractTasks(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
  if (!meeting) throw new Error("No meeting found.");
  if (!meeting.transcript?.trim()) throw new Error("Transcript is empty.");
  const tasks = await extractMeetingTasks(meeting.transcript);
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
  revalidateMeetingViews(id);
}

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const meetingId = formString(formData, "meetingId");
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, createdById: user.id } });
  if (!meeting) throw new Error("No meeting found.");
  await prisma.task.create({
    data: {
      meetingId,
      title: formString(formData, "title"),
      description: formString(formData, "description") || null,
      assigneeName: formString(formData, "assigneeName") || null,
      deadline: formString(formData, "deadline") ? new Date(formString(formData, "deadline")) : null,
      priority: (formString(formData, "priority") || "medium") as TaskPriority
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
  await prisma.meeting.delete({ where: { id, createdById: user.id } });
  revalidateMeetingViews();
}
