"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { extractMeetingTasks, generateMeetingSummary } from "@/lib/ai/openai";
import type { TaskPriority, TaskStatus } from "@prisma/client";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function registerUser(formData: FormData) {
  const name = formString(formData, "name");
  const email = formString(formData, "email").toLowerCase();
  const password = formString(formData, "password");
  if (!name || !email || password.length < 6) throw new Error("Please enter name, email, and a 6+ character password.");
  await prisma.user.create({ data: { name, email, passwordHash: await hash(password, 10) } });
  redirect("/login");
}

export async function createMeeting(formData: FormData) {
  const user = await requireUser();
  const title = formString(formData, "title") || "កិច្ចប្រជុំគ្មានចំណងជើង";
  const audioUrl = formString(formData, "audioUrl") || null;
  const duration = Number(formData.get("duration") ?? 0);
  const meeting = await prisma.meeting.create({
    data: { title, audioUrl, duration: Number.isFinite(duration) ? duration : 0, createdById: user.id }
  });
  revalidatePath("/meetings");
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
  await prisma.meeting.update({
    where: { id, createdById: user.id },
    data: { transcript, status: "transcribed" }
  });
  revalidatePath(`/meetings/${id}`);
}

export async function generateSummary(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });
  if (!meeting) throw new Error("No meeting found.");
  if (!meeting.transcript?.trim()) throw new Error("Transcript is empty.");
  const summary = await generateMeetingSummary(meeting.transcript);
  await prisma.meeting.update({ where: { id }, data: { summary, status: "summarized" } });
  revalidatePath(`/meetings/${id}`);
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
  revalidatePath(`/meetings/${id}`);
  revalidatePath("/tasks");
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
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/tasks");
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
  revalidatePath("/tasks");
}

export async function deleteTask(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const task = await prisma.task.findFirst({ where: { id, meeting: { createdById: user.id } } });
  if (!task) throw new Error("No task found.");
  await prisma.task.delete({ where: { id } });
  revalidatePath("/tasks");
}

export async function deleteMeeting(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  await prisma.meeting.delete({ where: { id, createdById: user.id } });
  revalidatePath("/meetings");
}
