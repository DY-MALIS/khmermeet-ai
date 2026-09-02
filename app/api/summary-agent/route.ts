import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { generateOpenRouterContent, hasOpenRouterKey } from "@/lib/ai/openrouter";
import { buildLanguageInstruction } from "@/lib/ai/prompts/languageInstruction";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
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

function isShortenCommand(command: string) {
  const lower = command.toLowerCase();
  return lower.includes("shorter") || lower.includes("concise") || command.includes("ខ្លី");
}

function fallbackAgentAnswer(command: string, meeting: { title: string; summary: string | null; transcript: string | null }) {
  const source = meeting.summary || meeting.transcript || "";
  const excerpt = source.slice(0, 900);
  return [
    `Summary Agent: ${meeting.title}`,
    "",
    "OPEN_ROUTER_API_KEY is not active yet, so this is a fallback answer from the available data.",
    "",
    command ? `Command: ${command}` : "",
    excerpt || "No transcript or summary is available for the Agent to analyze yet."
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
      where: { id: meetingId, ...ownerWhere(user) },
      include: { tasks: { orderBy: { createdAt: "desc" } } }
    });

    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });

    const transcript = meeting.transcript?.trim() ?? "";
    if (!hasUsableTranscript(transcript)) {
      return NextResponse.json(
        {
          error:
            "The transcript is not clear enough for summarizing yet. Transcribe the audio again or edit the transcript manually before using Summary Agent."
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
    const shortenExistingSummary = isShortenCommand(command) && Boolean(meeting.summary?.trim());
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
      "Your job is to answer the user's command using only the transcript, current summary, and tasks provided below.",
      buildLanguageInstruction(language),
      "Always treat the transcript as meeting minutes and use the fixed meeting-minutes structure below, whatever the content is - a work discussion, a lesson, a lecture, a speech, training content, or anything else. Map the content onto that same structure rather than inventing a different set of headings.",
      "Summarize decisions, problems, owners, deadlines, and next steps whenever the transcript contains them. If it is a lesson, lecture, speech, or training talk, its central message and advice become the key points, and its practical takeaways become the next steps.",
      "Do not invent facts, people, dates, decisions, problems, or tasks.",
      `If the transcript does not contain enough information for a requested section, write: ${missingInfoPlaceholder}`,
      "Do not use markdown bold markers like **.",
      "Keep the answer clean, readable, and grouped into short sections or bullets.",
      "Default style: concise, clear, and useful. For long transcripts, include enough detail to preserve the main argument; do not return a shallow two-line summary. Use 5-8 key-point bullets when there is enough real content for that many distinct points; use fewer only if the source genuinely does not contain that many distinct points - do not pad with filler or repeated points. When the user asks to make the summary shorter, tighten the wording of each bullet but keep the same key points and the same number of bullets from the current summary - do not drop bullets, drop sections, or introduce different content.",
      "",
      `User command: ${command}`,
      "",
      `Meeting title: ${meeting.title}`,
      "",
      shortenExistingSummary
        ? "Important: The user wants a shorter version of the CURRENT SUMMARY below. It is already correct - only tighten the wording. Do not reinterpret the content type or change which points are covered."
        : regeneratingSummary
          ? "Important: The user is asking for a new or improved summary. Use ONLY the transcript below as the source of truth."
          : `Current summary:\n${meeting.summary ?? "No summary yet."}`,
      "",
      shortenExistingSummary
        ? `Current summary to shorten:\n${meeting.summary?.trim().slice(0, 5000)}`
        : `Transcript:\n${transcript.slice(0, regeneratingSummary ? 6000 : 4000)}`,
      "",
      `Action tasks:\n${taskText}`,
      "",
      regeneratingSummary
        ? `Unless the user's command asks for something else, return these sections: ${sectionLabels}.`
        : "Return a concise, useful answer for the user's command."
    ].join("\n");

    const answer = await generateOpenRouterContent([{ text: prompt }], {
      temperature: 0.1,
      timeoutMs: 45000,
      maxTokens: shortenExistingSummary ? 800 : regeneratingSummary ? 1200 : 800
    });
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
