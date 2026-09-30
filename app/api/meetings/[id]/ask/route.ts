import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { answerMeetingQuestion, transcribeOpenRouterAudioViaChat } from "@/lib/ai/openrouter";
import type { MeetingQaTurn } from "@/lib/ai/prompts/meetingQaPrompt";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { publicAiTranscriptionError } from "@/lib/api-error-messages";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel refuses request bodies over ~4.5 MB; a 60s question at 64 kbps is ~0.5 MB.
const MAX_QUESTION_AUDIO_BYTES = 4 * 1024 * 1024;

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseHistory(value: unknown): MeetingQaTurn[] {
  let raw = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((turn) => typeof turn?.question === "string" && typeof turn?.answer === "string")
    .slice(-6)
    .map((turn) => ({ question: turn.question.slice(0, 500), answer: turn.answer.slice(0, 2000) }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-generate");
    if (limited) return limited;
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, ...ownerWhere(user) } });
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    if (!meeting.transcript?.trim() || !hasUsableTranscript(meeting.transcript)) {
      return NextResponse.json({ error: "Transcript has no clear speech text yet." }, { status: 400 });
    }

    let question = "";
    let history: MeetingQaTurn[] = [];
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      // Spoken question: the recording is turned into text with the same
      // transcription model the meetings use, and that text is sent back so
      // the person can see what was heard.
      const form = await request.formData();
      history = parseHistory(form.get("history"));
      const audio = form.get("audio");
      if (!(audio instanceof File) || audio.size === 0) {
        return NextResponse.json({ error: "No voice recording was received. Please try again." }, { status: 400 });
      }
      if (audio.size > MAX_QUESTION_AUDIO_BYTES) {
        return NextResponse.json({ error: "The spoken question is too long. Please keep it under one minute." }, { status: 400 });
      }
      const heard = await transcribeOpenRouterAudioViaChat(
        Buffer.from(await audio.arrayBuffer()),
        audio.type || "audio/webm",
        audio.name || "question.webm",
        "km-en",
        22000,
        [],
        true
      );
      question = heard.replace(/\[(?:unclear|silence)\]/gi, " ").replace(/\s+/g, " ").trim().slice(0, 500);
      if (!question) {
        return NextResponse.json(
          { error: "Could not hear a question in the recording. Please speak closer to the microphone and try again." },
          { status: 422 }
        );
      }
    } else {
      const body = await request.json().catch(() => ({}));
      question = typeof body?.question === "string" ? body.question.trim().slice(0, 500) : "";
      history = parseHistory(body?.history);
    }
    if (!question) return NextResponse.json({ error: "Question is required." }, { status: 400 });

    const result = await answerMeetingQuestion(meeting.transcript, question, history, 32000);

    // The model has been seen returning its own answer as the "quote" -
    // only show a quote that really is in the transcript.
    const quoteNeedle = result.quote ? normalize(result.quote).slice(0, 60) : "";
    if (!quoteNeedle || !normalize(meeting.transcript).includes(quoteNeedle)) {
      result.quote = null;
      result.speakerName = null;
    }

    let startMs: number | null = null;
    if (result.quote) {
      const segments = await prisma.meetingTranscriptSegment.findMany({
        where: { meetingId: id },
        orderBy: { startMs: "asc" }
      });
      const needle = normalize(result.quote);
      const match = segments.find((segment) => needle.length > 0 && normalize(segment.text).includes(needle.slice(0, Math.min(needle.length, 60))));
      if (match) startMs = match.startMs;
    }

    return NextResponse.json({ question, answer: result.answer, quote: result.quote, speakerName: result.speakerName, startMs });
  } catch (error) {
    const publicError = publicAiTranscriptionError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
