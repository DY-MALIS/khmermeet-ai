"use server";

import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { extractMeetingTasks, generateMeetingSummary } from "@/lib/ai/openrouter";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { deleteStoredAudio, normalizeTranscriptionLanguageMode } from "@/lib/storage";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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
  if (!name || !email || password.length < 6) {
    redirect("/register?error=invalid");
  }

  try {
    await prisma.user.create({ data: { name, email, passwordHash: await hash(password, 10) } });
  } catch (error) {
    // A duplicate email (P2002 = unique constraint violation) is a routine,
    // expected case for a real multi-user app, not a real error - without
    // this catch it was an unhandled throw out of a Server Action, which
    // Next.js renders as the generic "Application error" crash page
    // (app/error.tsx) instead of a message telling the person what to do.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect("/register?error=exists");
    }
    throw error;
  }

  // Creating the row here isn't a session - send them to log in with the
  // credentials they just chose rather than a /dashboard they have no access to.
  redirect("/login?registered=1");
}

export async function requestPasswordReset(formData: FormData) {
  const email = formString(formData, "email").toLowerCase();
  if (!email) throw new Error("សូមបញ្ចូល email។");

  // Enforced before the user lookup below so this can't be used to probe
  // whether an email is registered by timing/behavior differences either.
  await enforceRateLimit(email, "password-reset-request");

  const user = await prisma.user.findUnique({ where: { email } });
  // Always end up on the same "check your email" page whether or not the
  // account exists - confirming/denying an email's registration here would
  // let anyone enumerate real accounts.
  if (user) {
    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS) }
    });
    const resetUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/reset-password?token=${token}`;
    // Swallowed behind the generic response above (an email-provider outage
    // still shouldn't reveal account existence) - logged server-side so a
    // misconfigured RESEND_API_KEY/domain is still visible to whoever
    // reads the logs, instead of silently pretending to have worked.
    await sendPasswordResetEmail(email, resetUrl).catch((error) => {
      console.error("sendPasswordResetEmail failed:", error);
    });
  }

  redirect("/forgot-password?sent=1");
}

export async function resetPassword(formData: FormData) {
  const token = formString(formData, "token");
  const password = formString(formData, "password");
  if (!token) throw new Error("Reset link មិនត្រឹមត្រូវទេ។");
  if (password.length < 6) throw new Error("ពាក្យសម្ងាត់ត្រូវការយ៉ាងតិច ៦ តួអក្សរ។");

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken || resetToken.expiresAt < new Date()) {
    throw new Error("Reset link ផុតកំណត់ ឬមិនត្រឹមត្រូវ។ សូមស្នើសុំម្តងទៀត។");
  }

  const passwordHash = await hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    // Every outstanding token for this user, not just the one used - a
    // password change should invalidate any other reset links still
    // floating in an old email.
    prisma.passwordResetToken.deleteMany({ where: { userId: resetToken.userId } })
  ]);

  redirect("/login?reset=1");
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

