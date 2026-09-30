import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { synthesizeGeminiSpeech, synthesizeSpeech } from "@/lib/ai/openrouter";
import { streamLiveAnswer } from "@/lib/ai/live-answer";
import type { MeetingQaTurn } from "@/lib/ai/prompts/meetingQaPrompt";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { publicAiTranscriptionError } from "@/lib/api-error-messages";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_QUESTION_AUDIO_BYTES = 4 * 1024 * 1024;

// Frame types in the response stream: [1-byte type][4-byte length][payload].
const FRAME_AUDIO = 1; // one sentence's WAV
const FRAME_QUESTION = 2; // the question as heard (UTF-8)
const FRAME_ANSWER = 3; // the full answer text, sent last (UTF-8)
const FRAME_ERROR = 4; // something failed (UTF-8 message)
const FRAME_NO_SPEECH = 5; // nothing audible - just listen again

function parseHistory(value: FormDataEntryValue | null): MeetingQaTurn[] {
  if (typeof value !== "string") return [];
  try {
    const raw = JSON.parse(value);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((turn) => typeof turn?.question === "string" && typeof turn?.answer === "string")
      .slice(-6)
      .map((turn) => ({ question: turn.question.slice(0, 500), answer: turn.answer.slice(0, 2000) }));
  } catch {
    return [];
  }
}

// One request for a whole spoken exchange in the live conversation: hear the
// question, stream the answer, and voice each sentence as soon as it is
// written - see lib/ai/live-answer.ts for why this replaced three calls.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const [limited, meeting, form] = await Promise.all([
      rateLimitResponse(user.id, "ai-generate"),
      prisma.meeting.findFirst({ where: { id, ...ownerWhere(user) }, select: { transcript: true } }),
      request.formData()
    ]);
    if (limited) return limited;
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    if (!meeting.transcript?.trim() || !hasUsableTranscript(meeting.transcript)) {
      return NextResponse.json({ error: "Transcript has no clear speech text yet." }, { status: 400 });
    }
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: "No voice recording was received. Please try again." }, { status: 400 });
    }
    if (audio.size > MAX_QUESTION_AUDIO_BYTES) {
      return NextResponse.json({ error: "The spoken question is too long. Please keep it under one minute." }, { status: 400 });
    }
    const voice = form.get("voice") === "male" ? "male" : "female";
    const history = parseHistory(form.get("history"));
    const audioBuffer = Buffer.from(await audio.arrayBuffer());
    const transcript = meeting.transcript;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (type: number, payload: Uint8Array) => {
          const header = new Uint8Array(5);
          header[0] = type;
          new DataView(header.buffer).setUint32(1, payload.length);
          controller.enqueue(header);
          if (payload.length) controller.enqueue(payload);
        };

        // Sentences are voiced in parallel as they arrive but sent in order.
        const voiced: Promise<Buffer>[] = [];
        let writingDone = false;
        let wake: (() => void) | null = null;
        const notify = () => {
          wake?.();
          wake = null;
        };

        const writing = (async () => {
          try {
            for await (const event of streamLiveAnswer({ audio: audioBuffer, mimeType: audio.type || "audio/webm", transcript, history, voice })) {
              if (event.type === "no-speech") send(FRAME_NO_SPEECH, new Uint8Array());
              else if (event.type === "question") send(FRAME_QUESTION, encoder.encode(event.text));
              else if (event.type === "done") send(FRAME_ANSWER, encoder.encode(JSON.stringify({ question: event.question, answer: event.answer })));
              else {
                const piece = event.text;
                const promise = synthesizeGeminiSpeech(piece, voice, 20000).catch((error) => {
                  console.warn("Gemini voice failed, using gpt-audio:", error instanceof Error ? error.message : error);
                  return synthesizeSpeech(piece, 25000, voice);
                });
                promise.catch(() => undefined);
                voiced.push(promise);
                notify();
              }
            }
          } catch (error) {
            const publicError = publicAiTranscriptionError(error);
            send(FRAME_ERROR, encoder.encode(publicError.message));
          } finally {
            writingDone = true;
            notify();
          }
        })();

        let next = 0;
        for (;;) {
          if (next < voiced.length) {
            try {
              send(FRAME_AUDIO, new Uint8Array(await voiced[next]));
            } catch (error) {
              console.warn("Voice piece failed:", error instanceof Error ? error.message : error);
              send(FRAME_ERROR, encoder.encode("Could not read part of the answer aloud."));
              break;
            }
            next += 1;
          } else if (writingDone) {
            break;
          } else {
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          }
        }
        await writing;
        controller.close();
      }
    });

    return new Response(stream, {
      // Vercel's compression would hold the whole stream back - see /speak.
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "identity",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    const publicError = publicAiTranscriptionError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
