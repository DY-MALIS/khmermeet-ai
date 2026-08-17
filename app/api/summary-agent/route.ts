import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { generateOpenRouterContent, hasOpenRouterKey } from "@/lib/ai/openrouter";
import { buildLanguageInstruction } from "@/lib/ai/prompts/languageInstruction";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizeTranscriptionLanguageMode } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { rateLimitResponse } from "@/lib/rate-limit";

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
    command.includes("រៀបចំ")
  );
}

function fallbackAgentAnswer(command: string, meeting: { title: string; summary: string | null; transcript: string | null }) {
  const source = meeting.summary || meeting.transcript || "";
  const excerpt = source.slice(0, 900);
  return [
    `Summary Agent: ${meeting.title}`,
    "",
    "OPEN_ROUTER_API_KEY មិនទាន់ដំណើរការ ដូច្នេះនេះជា fallback answer ពីទិន្នន័យដែលមាន។",
    "",
    command ? `ពាក្យបញ្ជា: ${command}` : "",
    excerpt || "មិនទាន់មាន transcript ឬ summary សម្រាប់ Agent វិភាគ។"
  ].filter(Boolean).join("\n");
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-generate");
    if (limited) return limited;
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

    const transcript = meeting.transcript?.trim() ?? "";
    if (!hasUsableTranscript(transcript)) {
      return NextResponse.json(
        {
          error:
            "Transcript មិនទាន់ច្បាស់គ្រប់គ្រាន់សម្រាប់សង្ខេបទេ។ សូម Transcribe audio ម្តងទៀត ឬកែ transcript ដោយដៃ មុនប្រើ Summary Agent។"
        },
        { status: 400 }
      );
    }

    const taskText = meeting.tasks.length
      ? meeting.tasks
          .slice(0, 12)
          .map((task, index) => `${index + 1}. ${task.title} | assignee: ${task.assigneeName ?? "-"} | deadline: ${task.deadline?.toISOString().slice(0, 10) ?? "-"} | status: ${task.status}`)
          .join("\n")
      : "No tasks yet.";

    if (!hasOpenRouterKey()) {
      return NextResponse.json({ answer: fallbackAgentAnswer(command, meeting), updatedSummary: false });
    }

    const regeneratingSummary = shouldRegenerateSummary(command);
    // The response must follow the meeting's own language, not the language
    // the user happened to type their command in - typing a Khmer command
    // like "សង្ខេបឡើងវិញ" over an English transcript must still answer in
    // English.
    const language = normalizeTranscriptionLanguageMode(meeting.language);
    const sectionLabels =
      language === "en"
        ? "Meeting overview, Key points, Decisions, Problems raised, Next steps"
        : "សង្ខេបប្រជុំ, ចំណុចសំខាន់ៗ, ការសម្រេចចិត្ត, បញ្ហាដែលបានលើកឡើង, ជំហានបន្ទាប់";
    const missingInfoPlaceholder = language === "en" ? "No clear information available." : "មិនមានព័ត៌មានច្បាស់លាស់។";
    const prompt = [
      "You are KhmerMeet AI Summary Agent for Cambodian teams.",
      "Your job is to answer the user's command using only the meeting transcript, current summary, and tasks provided below.",
      buildLanguageInstruction(language),
      "Do not invent facts, people, dates, decisions, problems, or tasks.",
      `If the transcript does not contain enough information for a requested section, write: ${missingInfoPlaceholder}`,
      "Do not use markdown bold markers like **.",
      "Keep the answer clean, readable, and grouped into short sections or bullets.",
      "Default style: concise, clear, and executive-ready. Use 1-2 sentences for overview and no more than 4 one-line bullets per section unless the user explicitly asks for detail.",
      "",
      `User command: ${command}`,
      "",
      `Meeting title: ${meeting.title}`,
      "",
      regeneratingSummary
        ? "Important: The user is asking for a new or improved summary. Use ONLY the transcript below as the source of truth."
        : `Current summary:\n${meeting.summary ?? "No summary yet."}`,
      "",
      `Transcript:\n${transcript.slice(0, 12000)}`,
      "",
      `Action tasks:\n${taskText}`,
      "",
      regeneratingSummary
        ? `If the user does not specify a format, return exactly these sections: ${sectionLabels}. Keep the full summary short enough to scan on one screen.`
        : "Return a concise, useful answer for the user's command."
    ].join("\n");

    const answer = await generateOpenRouterContent([{ text: prompt }], { temperature: 0.1 });
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
