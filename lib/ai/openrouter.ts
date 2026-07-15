import { z } from "zod";
import { buildSummaryPrompt } from "@/lib/ai/prompts/summaryPrompt";
import { buildTaskExtractionPrompt } from "@/lib/ai/prompts/taskExtractionPrompt";

type TextPart = { text: string };

type OpenRouterErrorContext = {
  status: number;
  safeDetail: string;
  providerStatus?: string;
};

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

function uploadHeaders() {
  return {
    Authorization: `Bearer ${getOpenRouterKey()}`,
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
  return process.env.OPEN_ROUTER_TEXT_MODEL ?? "openai/gpt-4o-mini";
}

export function transcriptionModel() {
  return process.env.OPEN_ROUTER_TRANSCRIBE_MODEL ?? "openai/whisper-large-v3";
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
  return "webm";
}

export async function transcribeOpenRouterAudio(
  audio: Buffer,
  mimeType: string,
  filename: string,
  language: "km" | "en" | "km-en",
  speakerNames: string[] = [],
  timeoutMs = 55000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  let response: Response;

  try {
    const formData = new FormData();
    formData.append("model", transcriptionModel());
    if (language !== "km-en") {
      formData.append("language", language);
    }
    formData.append("temperature", "0");
    formData.append(
      "prompt",
      buildTranscriptionPrompt(language, speakerNames)
    );
    formData.append(
      "file",
      new File([new Uint8Array(audio)], filename || `meeting-audio.${audioFormat(mimeType, filename)}`, {
        type: mimeType || "audio/webm"
      })
    );

    response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: uploadHeaders(),
      signal: controller.signal,
      body: formData
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
      ? "The final transcript must be Khmer only. Keep Khmer script. Do not translate into English."
      : language === "en"
        ? "The final transcript must be English only. Do not translate into Khmer."
        : "The final transcript may contain Khmer and English. Keep each spoken phrase in its original language.";
  const speakerInstruction = speakerNames.length
    ? `Known speaker names: ${speakerNames.join(", ")}. Preserve or add the correct known speaker label when the source line already indicates that speaker. If there is only one known speaker, prefix each spoken line with that speaker name.`
    : "Preserve Speaker 1, Speaker 2 labels if present. Do not invent real person names.";

  const prompt = [
    "You are a careful meeting transcript proofreader.",
    "Clean the raw speech-to-text output into a readable meeting transcript.",
    languageInstruction,
    speakerInstruction,
    "Rules:",
    "- Do not summarize.",
    "- Do not add new facts, decisions, or tasks.",
    "- Do not translate between Khmer and English unless the selected mode explicitly requires one language.",
    "- Keep the meaning and word order as close as possible to the raw transcript.",
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

function buildTranscriptionPrompt(language: "km" | "en" | "km-en", speakerNames: string[]) {
  const languageInstruction =
    language === "km"
      ? "Transcribe only the spoken Khmer speech in Khmer script."
      : language === "en"
        ? "Transcribe only the spoken English speech in English."
        : "Transcribe exactly what is spoken. Preserve Khmer speech in Khmer script and English speech in English.";

  const speakerInstruction = speakerNames.length
    ? `Known speaker names: ${speakerNames.join(", ")}. If you can identify the speaker from the supplied audio track or context, start each line with the speaker name followed by a colon. If there is only one known speaker, use that speaker name for every spoken line.`
    : "Do not guess real speaker names. If multiple speakers are clearly present but names are unknown, use Speaker 1, Speaker 2, etc.";

  return [
    languageInstruction,
    speakerInstruction,
    "This is a verbatim meeting transcript task.",
    "Do not translate between Khmer and English.",
    "Do not summarize.",
    "Do not add timestamps.",
    "Do not invent missing words.",
    "Keep every clear phrase and sentence in the order spoken.",
    "If a word or short phrase is unclear, write [unclear] only for that part.",
    "Return transcript text only."
  ].join(" ");
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

export async function generateMeetingSummary(transcript: string) {
  if (!transcript.trim()) throw new Error("Transcript is empty.");
  if (!hasOpenRouterKey()) return fallbackSummary(transcript);
  return generateOpenRouterContent([{ text: buildSummaryPrompt(transcript) }], { temperature: 0.2 });
}

export async function extractMeetingTasks(transcript: string) {
  if (!transcript.trim()) throw new Error("Transcript is empty.");
  if (!hasOpenRouterKey()) return fallbackTasks(transcript);
  const raw = await generateOpenRouterContent([{ text: buildTaskExtractionPrompt(transcript) }], {
    json: true,
    temperature: 0.1
  });
  return taskSchema.parse(parseJsonObject(raw)).tasks;
}

export type TranscriptTranslationTarget = "km" | "en";

export async function translateMeetingTranscript(transcript: string, targetLanguage: TranscriptTranslationTarget) {
  if (!transcript.trim()) throw new Error("Transcript is empty.");
  if (!hasOpenRouterKey()) throw new Error("OPEN_ROUTER_API_KEY is missing.");
  const target = targetLanguage === "km" ? "natural Khmer only" : "natural English only";
  const prompt = [
    "You are the KhmerMeet AI transcript translation agent.",
    `Translate the entire transcript into ${target}.`,
    "This is translation, not summarization. Do not add facts or markdown.",
    "Preserve speaker labels, names, URLs, exact numbers, and line breaks when possible.",
    "Transcript:",
    transcript
  ].join("\n");
  return generateOpenRouterContent([{ text: prompt }], { temperature: 0.1 });
}
