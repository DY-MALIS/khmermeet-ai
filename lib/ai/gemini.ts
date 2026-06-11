import { z } from "zod";
import { buildSummaryPrompt } from "@/lib/ai/prompts/summaryPrompt";
import { buildTaskExtractionPrompt } from "@/lib/ai/prompts/taskExtractionPrompt";

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiWirePart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { inline_data: { mime_type: string; data: string } };

export class GeminiApiError extends Error {
  status: number;
  safeDetail: string;
  googleStatus?: string;
  googleReason?: string;
  retryDelay?: string;

  constructor(message: string, context: GeminiApiErrorContext) {
    super(message);
    this.name = "GeminiApiError";
    this.status = context.status;
    this.safeDetail = context.safeDetail;
    this.googleStatus = context.googleStatus;
    this.googleReason = context.googleReason;
    this.retryDelay = context.retryDelay;
  }
}

type GeminiApiErrorContext = {
  status: number;
  safeDetail: string;
  googleStatus?: string;
  googleReason?: string;
  retryDelay?: string;
};

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

function getGeminiKey() {
  const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");
  return apiKey;
}

export function textModel() {
  return process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash-lite";
}

export function transcriptionModel() {
  return process.env.GEMINI_TRANSCRIBE_MODEL ?? "gemini-2.5-flash";
}

export type TranscriptTranslationTarget = "km" | "en";

export async function generateGeminiContent(
  parts: GeminiPart[],
  options: { model?: string; json?: boolean; temperature?: number; timeoutMs?: number } = {}
) {
  try {
    return await requestGeminiContent(parts, options);
  } catch (error) {
    const hasAudio = parts.some((part) => "inlineData" in part);
    if (!hasAudio || !(error instanceof Error) || !error.message.includes("Gemini API error 400")) {
      throw error;
    }

    return requestGeminiContent(
      parts.map((part) =>
        "inlineData" in part
          ? { inline_data: { mime_type: part.inlineData.mimeType, data: part.inlineData.data } }
          : part
      ),
      options
    );
  }
}

function toGeminiErrorMessage(status: number, detail: string) {
  const lower = detail.toLowerCase();
  if (status === 403 && lower.includes("suspended")) {
    return "Gemini API key ត្រូវបាន suspended។ សូមបង្កើត API key ថ្មី ហើយដាក់ GEMINI_API_KEY ថ្មីក្នុង Vercel។";
  }
  if (status === 403) {
    return "Gemini API permission denied។ សូមពិនិត្យ GEMINI_API_KEY និង API access ក្នុង Google AI Studio។";
  }
  if (status === 429 || lower.includes("quota")) {
    return "Gemini quota បានអស់។ សូមបន្ថែម quota/billing ឬប្ដូរ API key ថ្មី។";
  }
  if (status === 400) {
    return "Gemini មិនអាចអាន audio chunk នេះបាន។ សូមនិយាយម្ដងទៀត ឬពិនិត្យ microphone។";
  }
  return `Gemini API error ${status}`;
}

function sanitizeGeminiDetail(detail: string) {
  return detail
    .replace(/key=AIza[0-9A-Za-z_-]+/g, "key=[hidden]")
    .replace(/AIza[0-9A-Za-z_-]+/g, "[hidden-api-key]")
    .slice(0, 1200);
}

function getGeminiErrorContext(status: number, detail: string): GeminiApiErrorContext {
  const safeDetail = sanitizeGeminiDetail(detail);
  let googleStatus: string | undefined;
  let googleReason: string | undefined;
  let retryDelay: string | undefined;

  try {
    const parsed = JSON.parse(detail) as {
      error?: {
        status?: string;
        details?: Array<{
          reason?: string;
          retryDelay?: string;
          violations?: Array<{ quotaMetric?: string; quotaId?: string }>;
        }>;
      };
    };
    googleStatus = parsed.error?.status;
    const detailItems = parsed.error?.details ?? [];
    googleReason =
      detailItems.find((item) => item.reason)?.reason ??
      detailItems.flatMap((item) => item.violations ?? []).find((item) => item.quotaMetric)?.quotaMetric ??
      undefined;
    retryDelay = detailItems.find((item) => item.retryDelay)?.retryDelay;
  } catch {
    // Google sometimes returns plain text. The sanitized detail is still useful.
  }

  return { status, safeDetail, googleStatus, googleReason, retryDelay };
}

async function requestGeminiContent(
  parts: GeminiWirePart[],
  options: { model?: string; json?: boolean; temperature?: number; timeoutMs?: number } = {}
) {
  const apiKey = getGeminiKey();
  const model = options.model ?? textModel();
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, options.timeoutMs ?? 55000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: options.temperature ?? (options.json ? 0.1 : 0.2),
            ...(options.json ? { responseMimeType: "application/json" } : {})
          }
        })
      }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Gemini request timed out. The audio may be too long for the current Vercel function. Please try a shorter recording or increase Vercel function duration.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GeminiApiError(toGeminiErrorMessage(response.status, detail), getGeminiErrorContext(response.status, detail));
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("\n")
      .trim() ?? ""
  );
}

function fallbackSummary(transcript: string) {
  const short = transcript.slice(0, 500);
  return `Meeting overview\nកំណត់ត្រានេះត្រូវបានសង្ខេបដោយ local fallback ព្រោះ GEMINI_API_KEY មិនទាន់បានកំណត់។\n\nKey discussion points\n- ${short}\n\nDecisions made\n- សូមពិនិត្យ transcript ដើម្បីបញ្ជាក់សេចក្តីសម្រេច។\n\nProblems mentioned\n- មិនបានរកឃើញបញ្ហាជាក់លាក់ដោយ fallback mode។\n\nNext steps\n- ពិនិត្យ transcript និងបង្កើតកិច្ចការដែលត្រូវអនុវត្ត។`;
}

function fallbackTasks(transcript: string) {
  const sentence = transcript
    .split(/[។.!?\n]/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!sentence) return [];
  return [
    {
      title: "ពិនិត្យ និងអនុវត្តចំណុចពីប្រជុំ",
      description: sentence,
      assigneeName: null,
      deadline: null,
      priority: "medium" as const,
      status: "not_started" as const,
      sourceText: sentence
    }
  ];
}

function parseJsonObject(raw: string) {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned || "{\"tasks\":[]}");
}

export async function generateMeetingSummary(transcript: string) {
  if (!transcript.trim()) throw new Error("Transcript is empty.");
  if (!process.env.GEMINI_API_KEY) return fallbackSummary(transcript);
  return generateGeminiContent([{ text: buildSummaryPrompt(transcript) }], {
    model: textModel(),
    temperature: 0.2
  });
}

export async function extractMeetingTasks(transcript: string) {
  if (!transcript.trim()) throw new Error("Transcript is empty.");
  if (!process.env.GEMINI_API_KEY) return fallbackTasks(transcript);
  const raw = await generateGeminiContent([{ text: buildTaskExtractionPrompt(transcript) }], {
    model: textModel(),
    json: true,
    temperature: 0.1
  });
  return taskSchema.parse(parseJsonObject(raw)).tasks;
}

function cleanTranslatedText(raw: string) {
  return raw
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

export async function translateMeetingTranscript(transcript: string, targetLanguage: TranscriptTranslationTarget) {
  if (!transcript.trim()) throw new Error("Transcript is empty.");
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing.");

  const targetInstruction =
    targetLanguage === "km"
      ? [
          "Translate the whole transcript into natural Khmer only.",
          "If the source mixes Khmer and English, convert the English parts into Khmer.",
          "Keep product names, people names, company names, acronyms, URLs, and exact numbers unchanged when translating them would be confusing.",
          "Use Khmer script for normal words."
        ]
      : [
          "Translate the whole transcript into natural English only.",
          "If the source mixes Khmer and English, convert the Khmer parts into English.",
          "Keep product names, people names, company names, acronyms, URLs, and exact numbers unchanged when translating them would be confusing.",
          "Use clear professional English."
        ];

  const prompt = [
    "You are a transcript translation agent for KhmerMeet AI.",
    "This is translation, not summarization.",
    "Translate all spoken content into one consistent target language.",
    "Do not add new facts, explanations, headings, markdown, notes, or confidence comments.",
    "Preserve speaker labels and line breaks when possible.",
    "If a sentence is unclear, translate only the clear parts and keep unclear names/terms as-is.",
    ...targetInstruction,
    "",
    "Transcript:",
    transcript
  ].join("\n");

  const translated = await generateGeminiContent([{ text: prompt }], {
    model: textModel(),
    temperature: 0.1
  });

  return cleanTranslatedText(translated);
}
