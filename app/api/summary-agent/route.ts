import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { generateGeminiContent } from "@/lib/ai/gemini";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const maxDuration = 60;

function shouldRegenerateSummary(command: string) {
  const lower = command.toLowerCase();
  return (
    lower.includes("summarize") ||
    lower.includes("summary") ||
    lower.includes("regenerate") ||
    lower.includes("new summary") ||
    lower.includes("shorter") ||
    lower.includes("longer") ||
    lower.includes("concise") ||
    lower.includes("detailed") ||
    command.includes("សង្ខេប") ||
    command.includes("ខ្លី") ||
    command.includes("វែង") ||
    command.includes("សង្ខេបឡើងវិញ") ||
    command.includes("បង្កើតសង្ខេប") ||
    command.includes("រៀបចំ summary")
  );
}

function fallbackAgentAnswer(command: string, meeting: { title: string; summary: string | null; transcript: string | null }) {
  const source = meeting.summary || meeting.transcript || "";
  const excerpt = source.slice(0, 900);
  return [
    `Summary Agent: ${meeting.title}`,
    "",
    "GEMINI_API_KEY មិនទាន់ដំណើរការ ដូច្នេះនេះជា fallback answer ពីទិន្នន័យដែលមាន។",
    "",
    command ? `ពាក្យបញ្ជា: ${command}` : "",
    excerpt || "មិនទាន់មាន transcript ឬ summary សម្រាប់ Agent វិភាគ។"
  ].filter(Boolean).join("\n");
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const meetingId = typeof body.meetingId === "string" ? body.meetingId.trim() : "";
    const command = typeof body.command === "string" ? body.command.trim() : "";

    if (!meetingId) return NextResponse.json({ error: "Meeting is required." }, { status: 400 });
    if (!command) return NextResponse.json({ error: "Command is required." }, { status: 400 });

    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, createdById: user.id },
      include: { tasks: { orderBy: { createdAt: "desc" } } }
    });

    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });

    const taskText = meeting.tasks.length
      ? meeting.tasks
          .slice(0, 12)
          .map((task, index) => `${index + 1}. ${task.title} | assignee: ${task.assigneeName ?? "-"} | deadline: ${task.deadline?.toISOString().slice(0, 10) ?? "-"} | status: ${task.status}`)
          .join("\n")
      : "No tasks yet.";

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ answer: fallbackAgentAnswer(command, meeting), updatedSummary: false });
    }

    const regeneratingSummary = shouldRegenerateSummary(command);
    const prompt = [
      "You are KhmerMeet AI Summary Agent for Cambodian teams.",
      "Help the user command, inspect, select, rewrite, or improve a meeting summary.",
      "Answer in Khmer by default, but if the user writes English, answer in English.",
      "Follow the user's preference: shorter, longer, bullet points, formal tone, simple language, selected person/name, selected section, decisions, problems, next steps, or action tasks.",
      "When the user asks to select names, people, section A/B, or specific text, answer only from the provided meeting data.",
      "Do not invent facts that are not in the transcript, summary, or tasks.",
      "Do not use markdown bold markers like **.",
      "If data is missing, say what is missing and suggest the next action.",
      "",
      `User command: ${command}`,
      "",
      `Meeting title: ${meeting.title}`,
      "",
      regeneratingSummary
        ? "Important: For this summary command, use ONLY the transcript below as the source of truth. Ignore the old summary if it conflicts with the transcript."
        : `Current summary:\n${meeting.summary ?? "No summary yet."}`,
      "",
      `Transcript:\n${meeting.transcript?.slice(0, 12000) ?? "No transcript yet."}`,
      "",
      `Action tasks:\n${taskText}`,
      "",
      regeneratingSummary
        ? "The user is asking for a new or improved summary. Follow the requested length and style. If the user does not specify a format, return: Meeting overview, Key discussion points, Decisions made, Problems mentioned, Next steps."
        : "Return a concise, useful answer for the user's command."
    ].join("\n");

    const answer = await generateGeminiContent([{ text: prompt }], { temperature: 0.2 });
    let updatedSummary = false;

    if (regeneratingSummary && answer.trim()) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { summary: answer.trim(), status: "summarized" }
      });
      revalidatePath(`/meetings/${meeting.id}`);
      revalidatePath("/summaries");
      updatedSummary = true;
    }

    return NextResponse.json({ answer, updatedSummary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Summary Agent failed." },
      { status: 500 }
    );
  }
}
