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
  language: "km" | "en",
  timeoutMs = 55000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  let response: Response;

  try {
    response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: requestHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model: transcriptionModel(),
        input_audio: {
          data: audio.toString("base64"),
          format: audioFormat(mimeType, filename)
        },
        language,
        temperature: 0
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

  const payload = (await response.json()) as { text?: string };
  return payload.text?.trim() ?? "";
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
