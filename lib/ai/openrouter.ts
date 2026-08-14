import { z } from "zod";
import { buildSummaryPrompt } from "@/lib/ai/prompts/summaryPrompt";
import { buildTaskExtractionPrompt } from "@/lib/ai/prompts/taskExtractionPrompt";
import { buildSmartNotePrompt } from "@/lib/ai/prompts/smartNotePrompt";
import { buildMeetingQaPrompt } from "@/lib/ai/prompts/meetingQaPrompt";
import type { DocumentLanguageMode } from "@/lib/ai/prompts/languageInstruction";

type TextPart = { text: string };

type OpenRouterErrorContext = {
  status: number;
  safeDetail: string;
  providerStatus?: string;
};

const DEFAULT_TEXT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_TRANSCRIPTION_MODEL_EN = "google/chirp-3";
const DEFAULT_TRANSCRIPTION_MODEL_KM = "google/chirp-3";

export class OpenRouterApiError extends Error {
  status: number;
  safeDetail: string;
  providerStatus?: string;

  constructor(message: string, context: OpenRouterErrorContext) {
    super(message);
    this.name = "OpenRouterApiError";
    this.status = context.status;
    this.safeDetail = context.safeDetail;
    this.providerStatus = context.providerStatus;
  }
}

const taskSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().nullable().optional(),
      assigneeName: z.string().nullable().optional(),
      deadline: z.string().nullable().optional(),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
      status: z.enum(["not_started", "in_progress", "completed"]).default("not_started"),
      sourceText: z.string().nullable().optional()
    })
  )
});

const smartNoteSchema = z.object({
  decisions: z.array(
    z.object({
      title: z.string().min(1),
      ownerName: z.string().nullable().optional(),
      deadline: z.string().nullable().optional(),
      sourceText: z.string().nullable().optional()
    })
  ).default([]),
  problems: z.array(z.string()).default([]),
  ideas: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([])
});

const meetingQaSchema = z.object({
  answer: z.string().min(1),
  quote: z.string().nullable().optional(),
  speakerName: z.string().nullable().optional()
});

function getOpenRouterKey() {
  const key = (process.env.OPEN_ROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY)?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("OPEN_ROUTER_API_KEY is missing.");
  return key;
}

function requestHeaders() {
  return {
    Authorization: `Bearer ${getOpenRouterKey()}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.NEXTAUTH_URL || "https://khmermeet-ai.vercel.app",
    "X-OpenRouter-Title": "KhmerMeet AI"
  };
}

function sanitizeDetail(detail: string) {
  return detail
    .replace(/sk-or-v1-[0-9A-Za-z_-]+/g, "[hidden-openrouter-key]")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [hidden]")
    .slice(0, 1200);
}

function parseErrorContext(status: number, detail: string): OpenRouterErrorContext {
  let providerStatus: string | undefined;
  try {
    const payload = JSON.parse(detail) as { error?: { code?: string | number; type?: string } };
    providerStatus = String(payload.error?.type ?? payload.error?.code ?? "") || undefined;
  } catch {
    // Some providers return plain text.
  }
  return { status, safeDetail: sanitizeDetail(detail), providerStatus };
}

function errorMessage(status: number) {
  if (status === 401 || status === 403) return "OpenRouter API key is invalid or does not have access.";
  if (status === 402) return "OpenRouter credits are not available. Please add credits to the OpenRouter account.";
  if (status === 408 || status === 504) return "OpenRouter request timed out.";
  if (status === 429) return "OpenRouter rate limit was reached. Please try again shortly.";
  return `OpenRouter API error ${status}.`;
}

export function textModel() {
  return process.env.OPEN_ROUTER_TEXT_MODEL ?? DEFAULT_TEXT_MODEL;
}

export function transcriptionModel(language: "km" | "en" | "km-en" = "km") {
  const configured = process.env.OPEN_ROUTER_TRANSCRIBE_MODEL?.trim();
  const defaultModel = language === "en" ? DEFAULT_TRANSCRIPTION_MODEL_EN : DEFAULT_TRANSCRIPTION_MODEL_KM;
  if (!configured) return defaultModel;

  const normalized = configured.toLowerCase();
  const isTtsModel = normalized.includes("tts") || normalized.includes("text-to-speech");
  if (isTtsModel) return defaultModel;

  return configured;
}

export function hasOpenRouterKey() {
  return Boolean((process.env.OPEN_ROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY)?.trim());
}

export async function generateOpenRouterContent(
  parts: TextPart[],
  options: { model?: string; json?: boolean; temperature?: number; timeoutMs?: number } = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, options.timeoutMs ?? 55000));
  let response: Response;

  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: requestHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model ?? textModel(),
        messages: [{ role: "user", content: parts.map((part) => part.text).join("\n") }],
        temperature: options.temperature ?? (options.json ? 0.1 : 0.2),
        ...(options.json ? { response_format: { type: "json_object" } } : {})
      })
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("OpenRouter request timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new OpenRouterApiError(errorMessage(response.status), parseErrorContext(response.status, detail));
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("\n").trim();
  return "";
}

function audioFormat(mimeType: string, filename: string) {
  const value = `${mimeType} ${filename}`.toLowerCase();
  if (value.includes("wav")) return "wav";
  if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
  if (value.includes("flac")) return "flac";
  if (value.includes("m4a") || value.includes("mp4")) return "m4a";
  if (value.includes("ogg")) return "ogg";
  if (value.includes("aac")) return "aac";
  // LiveKit Egress HLS audio segments are MPEG-TS containers carrying AAC audio.
  if (value.includes("mp2t") || value.endsWith(".ts")) return "aac";
  return "webm";
}

export async function transcribeOpenRouterAudio(
  audio: Buffer,
  mimeType: string,
  filename: string,
  language: "km" | "en" | "km-en",
  timeoutMs = 55000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  let response: Response;

  try {
    const body: Record<string, unknown> = {
      model: transcriptionModel(language),
      temperature: 0,
      input_audio: {
        data: audio.toString("base64"),
        format: audioFormat(mimeType, filename)
      }
    };
    if (language !== "km-en") {
      body.language = language;
    }

    response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: requestHeaders(),
      signal: controller.signal,
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenRouter transcription timed out. Please split long recordings into smaller parts.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const message =
      response.status === 400
        ? "OpenRouter rejected the transcription request. Check that OPEN_ROUTER_TRANSCRIBE_MODEL is a valid OpenRouter STT model and that the audio format is supported, or remove that environment variable to use the default."
        : errorMessage(response.status);
    throw new OpenRouterApiError(message, parseErrorContext(response.status, detail));
  }

  const payload = (await response.json()) as {
    text?: string;
    transcript?: string;
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  if (typeof payload.text === "string") return payload.text.trim();
  if (typeof payload.transcript === "string") return payload.transcript.trim();
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("\n").trim();
  return "";
}

// gemini-2.5-pro over gemini-2.5-flash: costs more per request but is
// noticeably more accurate on Khmer audio, and transcript quality is
// central to this product - worth the difference.
const DEFAULT_TRANSCRIPTION_FALLBACK_MODEL = "google/gemini-2.5-pro";

function multimodalTranscriptionModel() {
  return process.env.OPEN_ROUTER_TRANSCRIBE_FALLBACK_MODEL?.trim() || DEFAULT_TRANSCRIPTION_FALLBACK_MODEL;
}

function transcriptionChatPrompt(language: "km" | "en" | "km-en", speakerNames: string[] = []) {
  // "Keep the full name" is stated explicitly and separately from the
  // language-conversion rule below - confirmed live that a multi-word brand
  // name spoken mixed into Khmer speech (e.g. "ABA PayWay") can otherwise
  // come back with a trailing word silently dropped ("ABA Pay"), which
  // slips past every other quality check since the output is still fluent,
  // grammatical text.
  const properNounRule =
    "Multi-word proper names, brand names, and product names (e.g. company names, app names, payment providers) must be transcribed completely and exactly as spoken - never drop, shorten, or merge part of a multi-word name.";
  const languageInstruction =
    language === "km"
      ? "Transcribe the speech into Khmer script only, even if some words were spoken in English or another language - convert their meaning into natural Khmer. Keep proper names, product names, URLs, and well-known acronyms in their original form (do not transliterate them into Khmer script)."
      : language === "en"
        ? "Transcribe the speech into English only, even if some words were spoken in Khmer or another language - convert their meaning into natural English. Keep proper names, product names, URLs, and well-known acronyms in their original form."
        : "The audio may contain both Khmer and English. Preserve each spoken phrase in the language it was actually spoken in - do not translate.";
  // Speaker names used to only reach the later text-only refine pass, which
  // can't re-listen to the audio - by then a misheard name (confirmed live:
  // "ដារ៉ា" heard as "តារា") is already locked into the transcript as wrong
  // text no amount of text-only cleanup can recover. Giving the model this
  // as a hint before it actually listens gives it a real chance to
  // recognize a name correctly from the audio itself.
  const vocabularyHint = speakerNames.length
    ? ` People who may be speaking in this recording, in case a name is hard to make out: ${speakerNames.join(", ")}.`
    : "";

  return [
    "You are a professional verbatim speech-to-text transcriber for a real meeting recording.",
    languageInstruction + vocabularyHint,
    properNounRule,
    "Listen to the entire attached audio file from start to end and transcribe every spoken sentence in chronological order.",
    "This is a literal transcription task, not a summary - do not skip, condense, or paraphrase.",
    "If multiple speakers are audible, label each turn as Speaker 1:, Speaker 2:, etc. If only one speaker, still label lines Speaker 1:.",
    "If a short phrase is inaudible or unclear, write [unclear] for that phrase only - never invent words.",
    "If the audio contains no discernible speech at all, respond with exactly: [no speech detected]",
    "Return the transcript text only - no preamble, no explanation, no markdown formatting, no commentary about the audio."
  ].join(" ");
}

// Fallback transcription path using a general multimodal chat model instead of
// a narrow speech-only model. google/chirp-3 (the primary STT model) has been
// confirmed to hallucinate or reject requests on Khmer audio specifically; a
// large multimodal model has broader language understanding and is tried here
// when the primary result comes back empty/unusable, without replacing chirp-3
// as the default for audio that it already handles fine (e.g. English).
export async function transcribeOpenRouterAudioViaChat(
  audio: Buffer,
  mimeType: string,
  filename: string,
  language: "km" | "en" | "km-en",
  timeoutMs = 55000,
  speakerNames: string[] = []
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  let response: Response;

  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: requestHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model: multimodalTranscriptionModel(),
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: transcriptionChatPrompt(language, speakerNames) },
              {
                type: "input_audio",
                input_audio: {
                  data: audio.toString("base64"),
                  format: audioFormat(mimeType, filename)
                }
              }
            ]
          }
        ]
      })
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenRouter transcription timed out. Please split long recordings into smaller parts.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new OpenRouterApiError(errorMessage(response.status), parseErrorContext(response.status, detail));
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => part.text ?? "").join("\n") : "";
  const trimmed = text.trim();
  return trimmed === "[no speech detected]" ? "" : trimmed;
}

export async function refineOpenRouterTranscript(
  transcript: string,
  language: "km" | "en" | "km-en",
  speakerNames: string[] = [],
  timeoutMs = 55000
) {
  const clean = transcript.trim();
  if (!clean || !hasOpenRouterKey()) return clean;

  const languageInstruction =
    language === "km"
      ? "The selected output language is Khmer. Return Khmer script only. If the raw transcript contains English or romanized Khmer, convert its meaning into natural Khmer. Keep only proper names, product names, URLs, code terms, and well-known acronyms in their original form."
      : language === "en"
        ? "The selected output language is English. Return English only. If the raw transcript contains Khmer, translate its meaning into natural English. Keep proper names, product names, URLs, code terms, and well-known acronyms in their original form."
        : "The final transcript may contain Khmer and English. Keep each spoken phrase in its original language.";
  const speakerInstruction = speakerNames.length
    ? `Known speaker names: ${speakerNames.join(", ")}. Every spoken turn must start with one of these names followed by a colon when the speaker can be identified. If the audio/source does not make the identity clear, use Unknown Speaker: instead of inventing a name. If there is only one known speaker, prefix each spoken line with that speaker name.`
    : "Preserve Speaker 1, Speaker 2 labels if present. Do not invent real person names.";

  const prompt = [
    "You are a careful meeting transcript proofreader.",
    "Clean the raw speech-to-text output into a readable meeting transcript.",
    languageInstruction,
    speakerInstruction,
    "Rules:",
    "- Do not summarize.",
    "- Do not add new facts, decisions, or tasks.",
    "- Keep speaker labels at the start of each spoken turn: Name: spoken text.",
    "- Do not combine different speakers into one paragraph.",
    "- For Khmer mode, normalize every clear spoken phrase into Khmer script only.",
    "- For English mode, normalize every clear spoken phrase into English only.",
    "- For Khmer + English mode, preserve each clear phrase in the language that was spoken.",
    "- Standard Khmer writing does not put spaces between the words of a sentence (only between separate phrases/clauses, around numerals, and around embedded English/Latin terms). The raw transcript below was produced by a speech recognizer that space-separates every syllable/word - rejoin those into normal, correctly-spaced Khmer script rather than copying its spacing.",
    "- Keep the meaning and word order as close as possible to the raw transcript.",
    "- Multi-word proper/product/brand names (e.g. company names, app names, payment providers) must stay complete and exact - never drop, shorten, merge, or transliterate part of a multi-word name.",
    "- Remove hallucinated words, timestamp-only lines, and repeated filler caused by recognition errors.",
    "- Remove timestamp-only lines, repeated filler caused by recognition errors, and obvious non-speech boilerplate.",
    "- If a phrase is unclear, write [unclear] instead of guessing.",
    "- Return transcript text only.",
    "",
    "Raw transcript:",
    clean
  ].join("\n");

  return generateOpenRouterContent([{ text: prompt }], {
    model: textModel(),
    temperature: 0,
    timeoutMs
  });
}

function fallbackSummary(transcript: string) {
  return `Meeting overview\n${transcript.slice(0, 500)}\n\nNext steps\n- Review the transcript and create action items.`;
}

function fallbackTasks(transcript: string) {
  const sentence = transcript.split(/[.!?\n]/).map((item) => item.trim()).find(Boolean);
  if (!sentence) return [];
  return [{
    title: "Review meeting action",
    description: sentence,
    assigneeName: null,
    deadline: null,
    priority: "medium" as const,
    status: "not_started" as const,
    sourceText: sentence
  }];
}

function parseJsonObject(raw: string) {
  return JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim() || "{\"tasks\":[]}");
}

export async function generateMeetingSummary(transcript: string, language: DocumentLanguageMode = "km") {
  if (!transcript.trim()) throw new Error("Transcript is empty.");
  if (!hasOpenRouterKey()) return fallbackSummary(transcript);
  return generateOpenRouterContent([{ text: buildSummaryPrompt(transcript, language) }], { temperature: 0.2 });
}

export async function extractMeetingTasks(transcript: string, language: DocumentLanguageMode = "km") {
  if (!transcript.trim()) throw new Error("Transcript is empty.");
  if (!hasOpenRouterKey()) return fallbackTasks(transcript);
  const raw = await generateOpenRouterContent([{ text: buildTaskExtractionPrompt(transcript, language) }], {
    json: true,
    temperature: 0.1
  });
  return taskSchema.parse(parseJsonObject(raw)).tasks;
}

export async function extractMeetingSmartNote(transcript: string, language: DocumentLanguageMode = "km") {
  if (!transcript.trim()) throw new Error("Transcript is empty.");
  if (!hasOpenRouterKey()) return { decisions: [], problems: [], ideas: [], questions: [] };
  const raw = await generateOpenRouterContent([{ text: buildSmartNotePrompt(transcript, language) }], {
    json: true,
    temperature: 0.1
  });
  return smartNoteSchema.parse(JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim() || "{}"));
}

export async function answerMeetingQuestion(transcript: string, question: string) {
  if (!transcript.trim()) throw new Error("Transcript is empty.");
  if (!question.trim()) throw new Error("Question is empty.");
  if (!hasOpenRouterKey()) throw new Error("OPEN_ROUTER_API_KEY is missing.");
  const raw = await generateOpenRouterContent([{ text: buildMeetingQaPrompt(transcript, question) }], {
    json: true,
    temperature: 0.1
  });
  return meetingQaSchema.parse(JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim() || "{}"));
}
