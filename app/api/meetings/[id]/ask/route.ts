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

// Run next to the database (Supabase, Seoul) instead of the default US
// region: every query was crossing the Pacific twice, and a live spoken
// conversation feels each of those round trips.
export const preferredRegion = "icn1";

class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Turns a spoken question into text with the same transcription model the
// meetings use; the text is sent back so the person can see what was heard.
async function hearQuestion(form: FormData) {
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) throw new HttpError("No voice recording was received. Please try again.", 400);
  if (audio.size > MAX_QUESTION_AUDIO_BYTES) throw new HttpError("The spoken question is too long. Please keep it under one minute.", 400);
  const heard = await transcribeOpenRouterAudioViaChat(
    Buffer.from(await audio.arrayBuffer()),
    audio.type || "audio/webm",
    audio.name || "question.webm",
    "km-en",
    22000,
    [],
    true
  );
  const question = heard.replace(/\[(?:unclear|silence)\]/gi, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!question) throw new HttpError("Could not hear a question in the recording. Please speak closer to the microphone and try again.", 422);
  return question;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const timings: string[] = [];
  const mark = (name: string, since: number) => timings.push(`${name};dur=${Date.now() - since}`);
  try {
    const user = await requireUser();
    mark("auth", started);
    const { id } = await params;

    // Everything that does not depend on each other starts at once: the
    // rate-limit check, the meeting lookup, and hearing a spoken question
    // (the slowest part) no longer wait for one another.
    const isSpoken = (request.headers.get("content-type") ?? "").includes("multipart/form-data");
    const parallelStart = Date.now();
    const inputPromise = isSpoken
      ? request.formData().then(async (form) => ({ history: parseHistory(form.get("history")), question: await hearQuestion(form) }))
      : request.json().catch(() => ({})).then((body) => ({
          history: parseHistory(body?.history),
          question: typeof body?.question === "string" ? body.question.trim().slice(0, 500) : ""
        }));
    inputPromise.catch(() => undefined);
    const [limited, meeting, segments] = await Promise.all([
      rateLimitResponse(user.id, "ai-generate"),
      prisma.meeting.findFirst({ where: { id, ...ownerWhere(user) } }),
      prisma.meetingTranscriptSegment.findMany({ where: { meetingId: id }, orderBy: { startMs: "asc" }, select: { startMs: true, text: true } })
    ]);
    if (limited) return limited;
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    if (!meeting.transcript?.trim() || !hasUsableTranscript(meeting.transcript)) {
      return NextResponse.json({ error: "Transcript has no clear speech text yet." }, { status: 400 });
    }
    const { question, history } = await inputPromise;
    mark(isSpoken ? "db+hear" : "db", parallelStart);
    if (!question) return NextResponse.json({ error: "Question is required." }, { status: 400 });

    const answerStart = Date.now();
    const result = await answerMeetingQuestion(meeting.transcript, question, history, 32000);
    mark("answer", answerStart);

    // The model has been seen returning its own answer as the "quote" -
    // only show a quote that really is in the transcript.
    const quoteNeedle = result.quote ? normalize(result.quote).slice(0, 60) : "";
    if (!quoteNeedle || !normalize(meeting.transcript).includes(quoteNeedle)) {
      result.quote = null;
      result.speakerName = null;
    }
    const match = quoteNeedle ? segments.find((segment) => normalize(segment.text).includes(quoteNeedle)) : undefined;

    mark("total", started);
    return NextResponse.json(
      { question, answer: result.answer, quote: result.quote, speakerName: result.speakerName, startMs: match?.startMs ?? null },
      { headers: { "Server-Timing": timings.join(", ") } }
    );
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    const publicError = publicAiTranscriptionError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
