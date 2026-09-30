import { OpenRouterApiError, requestHeaders } from "@/lib/ai/openrouter";
import type { AnswerVoice, MeetingQaTurn } from "@/lib/ai/prompts/meetingQaPrompt";

// The live conversation used to take three calls in a row - transcribe the
// question (~2.5s), write the answer (~2-4s), then voice it (~4-6s) - which
// the owner experienced as a long "thinking" pause after every question.
// Here one Gemini call hears the question and streams the answer back, and
// each sentence is handed on for voicing the moment it is complete.

export type LiveAnswerEvent =
  | { type: "question"; text: string }
  | { type: "piece"; text: string }
  | { type: "no-speech" }
  | { type: "done"; question: string; answer: string };

// Gemini needs ~2s to voice a short phrase but ~5.5s for a long Khmer
// sentence, and nothing can play until the first piece is voiced - so the
// first piece is cut at the first pause (a Khmer space or a comma), later
// ones at sentence ends, with long run-on sentences split at a space.
const SENTENCE_END = /[។?!.\n]/;
const PAUSE = /[\s,]/;

function findCut(rest: string, first: boolean) {
  const isKhmer = /[ក-៿]/.test(rest);
  if (first) {
    // Khmer spaces mark phrase pauses; English spaces are between every word,
    // so English waits for a comma or a sentence end (or ~40 characters).
    for (let index = 12; index < rest.length; index++) {
      const char = rest[index];
      if (SENTENCE_END.test(char) || char === "," || (isKhmer && PAUSE.test(char))) return index + 1;
      if (!isKhmer && index >= 40 && char === " ") return index + 1;
    }
    return -1;
  }
  for (let index = 30; index < rest.length; index++) {
    if (SENTENCE_END.test(rest[index])) return index + 1;
    if (index >= 110 && PAUSE.test(rest[index])) return index + 1;
  }
  return -1;
}

function liveSystemPrompt(transcript: string, history: MeetingQaTurn[], voice: AnswerVoice) {
  const particle = voice === "male" ? "បាទ" : "ចាស";
  const earlier = history.length
    ? `\nEarlier in this conversation:\n${history.map((turn, index) => `Q${index + 1}: ${turn.question}\nA${index + 1}: ${turn.answer}`).join("\n")}\n`
    : "";
  return `You are the voice assistant of KhmerMeet. A person asks you a question out loud, usually about the recorded meeting below, and you answer out loud.

OUTPUT FORMAT - exactly this, nothing else:
Q: <the person's question, written exactly as they said it, in the language they used>
A: <your spoken answer>
If the audio has no clear speech, output only: Q: [none]

LANGUAGE - follow the language of your own Q line, never the transcript's:
- English question -> the whole answer in English (translate what was said in the meeting).
- Khmer question -> answer in Khmer.
- Khmer mixed with English words -> answer in Khmer, keeping those English words in English the way Cambodians talk.
- Khmer must be pure Khmer - never Thai or Lao words or spelling.

WHAT YOU CAN ANSWER:
- About the meeting (what it was about, a summary, key points, decisions, who said what, tasks, deadlines): the transcript is the only source of what was said. Never invent anything as having been said in the meeting.
- Advice and next steps (e.g. what strategy to do next, how to improve, risks, priorities): give practical recommendations based on the meeting plus your own knowledge, and make clear they are your suggestions (e.g. "ខ្ញុំគិតថា ...", "I'd suggest ...").
- Anything else, even unrelated to the meeting: answer helpfully from your general knowledge.
- If they ask about something the meeting did not cover, say briefly that it was not discussed, then still help with what you know.

HOW TO SPEAK (this is read aloud):
- Do NOT start with "${particle}" or any other opener - a short acknowledgement has already been said. Go straight to the answer.
- Everyday spoken language like a friendly colleague, not formal writing. Short sentences, with a comma or a space at each natural breath pause.
- Several points are said out loud as "ទីមួយ, ...។ ទីពីរ, ...។" (or "First, ... Second, ..." in English). No lists, symbols, markdown or emoji.
- Simple questions: 1-3 sentences. Summaries, key points or strategy: up to about 8 sentences.
${earlier}
MEETING TRANSCRIPT:
${transcript}`;
}

function audioFormat(mimeType: string) {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function liveAnswerModel() {
  // gemini-3.8-flash wrote the first sentence in 1.9-3.2s against 3.2-6.6s for
  // the transcription default, same answer quality; flash-lite was faster still
  // but leaked Thai and Burmese letters into Khmer answers.
  return process.env.OPEN_ROUTER_LIVE_MODEL?.trim() || "google/gemini-3.8-flash";
}

// Streams Gemini's reply and yields the heard question, then the answer in
// sentence-sized pieces as soon as each one is complete.
export async function* streamLiveAnswer(options: {
  audio: Buffer;
  mimeType: string;
  transcript: string;
  history: MeetingQaTurn[];
  voice: AnswerVoice;
  timeoutMs?: number;
  model?: string;
}): AsyncGenerator<LiveAnswerEvent> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 40000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: requestHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model ?? liveAnswerModel(),
        stream: true,
        temperature: 0.3,
        max_tokens: 900,
        reasoning: { effort: "minimal", exclude: true },
        provider: { sort: "latency" },
        messages: [
          { role: "system", content: liveSystemPrompt(options.transcript, options.history, options.voice) },
          {
            role: "user",
            content: [
              { type: "text", text: "Here is my spoken question." },
              { type: "input_audio", input_audio: { data: options.audio.toString("base64"), format: audioFormat(options.mimeType) } }
            ]
          }
        ]
      })
    });
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw new OpenRouterApiError(
        response.status === 429 ? "OpenRouter rate limit was reached. Please try again shortly." : `OpenRouter API error ${response.status}.`,
        { status: response.status, safeDetail: detail.slice(0, 500) }
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let text = "";
    let question: string | null = null;
    let answerStart = -1;
    let spokenUpTo = 0;
    let piecesSent = 0;

    const takePieces = function* (final: boolean): Generator<LiveAnswerEvent> {
      if (answerStart < 0) return;
      for (;;) {
        const rest = text.slice(answerStart + spokenUpTo);
        const cut = findCut(rest, piecesSent === 0);
        if (cut < 0) {
          if (final && rest.trim()) {
            spokenUpTo += rest.length;
            piecesSent += 1;
            yield { type: "piece", text: rest.trim() };
          }
          return;
        }
        spokenUpTo += cut;
        const piece = rest.slice(0, cut).trim();
        if (piece) {
          piecesSent += 1;
          yield { type: "piece", text: piece };
        }
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const data = line.trim().replace(/^data:\s*/, "");
        if (!data.startsWith("{")) continue;
        try {
          const delta = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content;
          if (delta) text += delta;
        } catch {
          // Keep-alive or partial frame.
        }
      }

      if (question === null) {
        const answerMarker = text.search(/\n\s*A:/);
        const questionLine = text.match(/Q:\s*([^\n]*)\n/);
        if (questionLine) {
          question = questionLine[1].trim();
          if (/^\[none\]$/i.test(question) || !question) {
            yield { type: "no-speech" };
            return;
          }
          yield { type: "question", text: question };
        }
        if (answerMarker >= 0) answerStart = text.indexOf("A:", answerMarker) + 2;
      } else if (answerStart < 0) {
        const answerMarker = text.search(/\n\s*A:/);
        if (answerMarker >= 0) answerStart = text.indexOf("A:", answerMarker) + 2;
      }
      yield* takePieces(false);
    }

    if (question === null) {
      // No "Q:" line at all - treat a bare reply as the answer if there is one.
      const bare = text.trim();
      if (!bare || /\[none\]/i.test(bare)) {
        yield { type: "no-speech" };
        return;
      }
      question = "";
      answerStart = 0;
    }
    if (answerStart < 0) answerStart = text.length;
    yield* takePieces(true);
    yield { type: "done", question, answer: text.slice(answerStart).trim() };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("OpenRouter request timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
