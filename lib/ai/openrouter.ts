import { z } from "zod";
import { buildSummaryPrompt } from "@/lib/ai/prompts/summaryPrompt";
import { buildSlideBulletsPrompt } from "@/lib/ai/prompts/slidePrompt";
import { buildTaskExtractionPrompt } from "@/lib/ai/prompts/taskExtractionPrompt";
import { buildSmartNotePrompt } from "@/lib/ai/prompts/smartNotePrompt";
import { buildMeetingQaPrompt } from "@/lib/ai/prompts/meetingQaPrompt";
import type { DocumentLanguageMode } from "@/lib/ai/prompts/languageInstruction";
import { hasTranscriptionPromptLeakage, hasUsableTranscript } from "@/lib/transcript-quality";

type TextPart = { text: string };

type OpenRouterErrorContext = {
  status: number;
  safeDetail: string;
  providerStatus?: string;
};

const DEFAULT_TEXT_MODEL = "openai/gpt-5.6-luna";
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
  options: { model?: string; json?: boolean; temperature?: number; timeoutMs?: number; maxTokens?: number } = {}
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
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
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

// Cost-driven choice (owner decision, 2026-08-31): flash is the default
// listener for cost savings, with pro kept as the safety-net retry
// (transcribeOpenRouterAudioViaChat) for the ~1/6 of calls where flash
// comes back empty - confirmed via OpenRouter's published pricing this
// only adds ~36% versus flash-only (pro is billed on that fraction of
// calls only), while avoiding pro-only cost entirely on the rest.
const DEFAULT_TRANSCRIPTION_FALLBACK_MODEL = "google/gemini-3.7-flash";
const DEFAULT_TRANSCRIPTION_SAFETY_NET_MODEL = "";

export function multimodalTranscriptionModel() {
  return process.env.OPEN_ROUTER_TRANSCRIBE_FALLBACK_MODEL?.trim() || DEFAULT_TRANSCRIPTION_FALLBACK_MODEL;
}

export function multimodalTranscriptionSafetyNetModel() {
  return process.env.OPEN_ROUTER_TRANSCRIBE_SAFETY_NET_MODEL?.trim() || DEFAULT_TRANSCRIPTION_SAFETY_NET_MODEL;
}

function transcriptionChatPrompt(language: "km" | "en" | "km-en", speakerNames: string[] = [], singleSpeaker = false) {
  // "Keep the full name" is stated explicitly and separately from the
  // language-conversion rule below - confirmed live that a multi-word brand
  // name spoken mixed into Khmer speech (e.g. "ABA PayWay") can otherwise
  // come back with a trailing word silently dropped ("ABA Pay"), which
  // slips past every other quality check since the output is still fluent,
  // grammatical text.
  const properNounRule =
    "Multi-word proper names, brand names, and product names (e.g. company names, app names, payment providers) must be transcribed completely and exactly as spoken - never drop, shorten, or merge part of a multi-word name. For example, if the audio says \"ABA PayWay\", the transcript must say \"ABA PayWay\" in full, never a shortened \"ABA Pay\". These names can blend together at normal speaking speed - listen closely for every syllable of a name rather than assuming it ends where a natural word would.";
  const languageInstruction =
    language === "km"
      ? "Transcribe the speech into Khmer script only, even if some words were spoken in English or another language - convert their meaning into modern, natural Khmer as used in Cambodia today. Do not use archaic, overly literary, or old-fashioned Khmer wording unless the speaker actually said it. Keep proper names, product names, URLs, and well-known acronyms in their original form (do not transliterate them into Khmer script)."
      : language === "en"
        ? "Transcribe the speech into English only, even if some words were spoken in Khmer or another language - convert their meaning into natural English. Keep proper names, product names, URLs, and well-known acronyms in their original form."
        : "The audio may contain both Khmer and English. Preserve each spoken phrase in the language it was actually spoken in - do not translate. Khmer speech must remain Khmer script. English speech must remain English. Do not translate Khmer speech into English to create a mixed transcript, and do not translate English speech into Khmer.";
  // Speaker names used to only reach the later text-only refine pass, which
  // can't re-listen to the audio - by then a misheard name (confirmed live:
  // "ដារ៉ា" heard as "តារា") is already locked into the transcript as wrong
  // text no amount of text-only cleanup can recover. Giving the model this
  // as a hint before it actually listens gives it a real chance to
  // recognize a name correctly from the audio itself.
  const knownSpeakerInstruction = speakerNames.length
    ? ` Known meeting participants: ${speakerNames.join(", ")}. Use a real participant name as the speaker label only when the audio or context makes that speaker identity clear. If you cannot confidently identify which participant is speaking, use Unknown Speaker: instead of guessing or assigning names by order. Do not force every audible voice onto the known-name list when the identity is uncertain.`
    : "";
  const selfIntroductionInstruction =
    "If a speaker clearly introduces a name in the audio (for example Khmer phrases like \"ខ្ញុំឈ្មោះ ...\", \"ខ្ញុំជា ...\", or English phrases like \"my name is ...\", \"I am ...\", \"I'm ...\", \"this is ...\"), transcribe that introduced name accurately inside the spoken sentence. Do not promote an introduced name into a speaker label unless the user already provided that exact participant name as a known speaker. Do not invent or guess real names.";
  const accuracyInstruction =
    "The audio is the only source of truth. First focus on hearing and resolving the speech as clearly as possible, including quiet voices, distant voices, fast syllables, numbers, dates, names, and short backchannel phrases, before writing the transcript. Write what is actually spoken, in the way it is spoken; do not guess, paraphrase, summarize, polish, or translate unless the selected language mode explicitly requires translation. Keep false starts, repeated words, confirmations, questions, and short replies when they are actually spoken. Do not remove a word merely because it sounds informal, redundant, or grammatically awkward. For Khmer speech, preserve the speaker's meaning exactly; for English mixed into Khmer, follow the selected language mode precisely.";

  return [
    "You are a professional verbatim speech-to-text transcriber for a real meeting recording.",
    languageInstruction + knownSpeakerInstruction,
    properNounRule,
    selfIntroductionInstruction,
    accuracyInstruction,
    "Listen to the entire attached audio file from start to end and transcribe every spoken sentence in chronological order.",
    "Do a clarity-first pass before writing: listen for faint syllables, repeated context, speaker changes, and words hidden under room noise. Only after that pass should you decide whether any span is truly unclear.",
    "Every audible word matters. Do not omit greetings, filler words, repeated words, side comments, short acknowledgements, incomplete phrases, or quiet replies.",
    "Never invent words from context. Never fill in a sentence because it would sound natural. If you cannot hear the exact word after careful listening, mark only that exact span as [unclear].",
    "If several people speak in the same minute, keep all speaker turns you can hear instead of returning only the clearest or longest speaker.",
    "Capture every audible speaker mouth and every audible word. Do not merge multiple people's speech into one cleaned sentence, and do not drop short interjections such as yes, no, okay, ah, um, or brief Khmer acknowledgements.",
    "When speakers overlap, separate each voice you can understand as its own turn in the closest chronological order. Listen carefully for both voices before using [unclear]; only the truly unintelligible words inside the overlap should become [unclear].",
    "Accuracy to the spoken audio is more important than fluency. Only write words you can actually hear in the audio.",
    "Never use general knowledge, grammar, context, or a likely meeting topic to decide what was said. The transcript must follow the sound, not an assumption.",
    "If the speaker says something unusual, informal, repeated, broken, or grammatically odd, keep it as spoken.",
    "Capture both near and distant speakers. Do not ignore a speaker because their voice is quiet, far from the microphone, off-axis, or partially masked by room noise.",
    "When a far or quiet voice is present, focus on the actual syllables and words in that voice before deciding whether any part is unclear. Do not give up on a word just because the volume is low.",
    "This is a literal transcription task, not a summary or translation task - do not skip, condense, paraphrase, polish, or rewrite the speaker's wording.",
    "Do not infer missing words from context, grammar, meeting topic, or speaker intent.",
    "Do not complete a sentence just because it sounds likely. If the exact words are not audible, mark only that unclear span as [unclear].",
    // Per-track chunks (client-mesh Server Rec, one file per participant's
    // own microphone) know in advance there is exactly one speaker - without
    // this, the model sometimes still hallucinates a "Speaker 2:" turn
    // inside a single continuous voice (confirmed live: a looping single-
    // speaker test clip came back with fabricated Speaker 1/Speaker 2
    // splits), which then shows up doubled-up under the real per-track
    // speaker label applied downstream.
    singleSpeaker
      ? speakerNames.length
        ? "This entire audio file is a single known speaker's own individual microphone track - there is exactly one speaker throughout. Do not add Speaker 1:, Speaker 2:, or any speaker labels - transcribe the speech as plain lines of text."
        : "This entire audio file is one speaker's own individual microphone track - there is exactly one speaker throughout. Do not add Speaker 1:, Speaker 2:, or real-name speaker labels - transcribe the speech as plain lines of text."
      : speakerNames.length
        ? "If multiple speakers are audible, split the transcript into separate speaker turns. Start each turn with the known participant name only when you can confidently identify that speaker; otherwise start it with Unknown Speaker:. Never guess a real name just because it appears in the participant list."
        : "If multiple speakers are audible, split the transcript into separate speaker turns. Start every turn with a generic speaker label such as Speaker 1:, Speaker 2:, etc. Do not use self-introduced names as speaker labels. If only one speaker is audible in this mixed recording, still label lines Speaker 1:.",
    "If a short phrase is inaudible or unclear, write [unclear] for that phrase only - never invent words.",
    "For quiet or distant speech, listen carefully and transcribe the words if they can be understood - do not mark speech [unclear] merely because it is low volume or far from the microphone.",
    "Use [unclear] only as a last resort after carefully trying to understand the speech and the exact words still cannot be determined. For noisy, overlapped, muted, or truly unintelligible sections, write [unclear] instead of producing a fluent guess.",
    "If the audio contains no discernible speech at all, respond with exactly: [no speech detected]",
    "Return the transcript text only - no title, no heading, no preamble, no explanation, no markdown formatting, and no commentary about the audio. Never write phrases like \"Verbatim transcript\", \"Here is the transcript\", or \"Transcript:\" unless those exact words were spoken in the audio."
  ].join(" ");
}

// Fallback transcription path using a general multimodal chat model instead of
// a narrow speech-only model. google/chirp-3 (the primary STT model) has been
// confirmed to hallucinate or reject requests on Khmer audio specifically; a
// large multimodal model has broader language understanding and is tried here
// when the primary result comes back empty/unusable, without replacing chirp-3
// as the default for audio that it already handles fine (e.g. English).
async function callMultimodalTranscription(
  model: string,
  audio: Buffer,
  mimeType: string,
  filename: string,
  language: "km" | "en" | "km-en",
  timeoutMs: number,
  speakerNames: string[],
  singleSpeaker: boolean
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
        model,
        temperature: 0,
        max_tokens: 16000,
        // Transcription is an audio-grounded extraction task. Keep Gemini's
        // mandatory thinking at its lowest supported level so it spends the
        // function budget listening and returning the transcript instead of
        // doing unnecessary deliberation.
        reasoning: { effort: "minimal", exclude: true },
        // OpenRouter otherwise favours the cheapest healthy provider. Long
        // recordings are latency-sensitive, so use the provider with the
        // best current throughput to avoid exhausting Vercel's request limit.
        provider: { sort: "throughput" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: transcriptionChatPrompt(language, speakerNames, singleSpeaker) },
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
  return trimmed === "[no speech detected]" || hasTranscriptionPromptLeakage(trimmed) ? "" : trimmed;
}

export async function transcribeOpenRouterAudioViaChat(
  audio: Buffer,
  mimeType: string,
  filename: string,
  language: "km" | "en" | "km-en",
  timeoutMs = 55000,
  speakerNames: string[] = [],
  singleSpeaker = false
) {
  // Callers size timeoutMs against their own serverless maxDuration budget
  // (e.g. 45s timeout inside a 60s function) - a naive second full-length
  // call for the safety-net retry below would blow past that budget and get
  // the function killed mid-flight. Instead both attempts share one overall
  // deadline: the retry only runs, and only for whatever time is actually
  // left, if the primary attempt returned quickly (an empty result from a
  // real timeout would already have thrown, not returned empty).
  const deadline = Date.now() + Math.max(1000, timeoutMs);
  const primaryModel = multimodalTranscriptionModel();
  const safetyNetModel = multimodalTranscriptionSafetyNetModel();
  const result = await callMultimodalTranscription(
    primaryModel,
    audio,
    mimeType,
    filename,
    language,
    deadline - Date.now(),
    speakerNames,
    singleSpeaker
  );
  if (hasUsableTranscript(result)) return result;

  if (result || !safetyNetModel || primaryModel === safetyNetModel) return result;

  const remaining = deadline - Date.now();
  if (remaining < 8000) return result;

  // Primary model came back empty on audio the caller believes has speech -
  // give the safety-net model one shot with whatever time budget is left.
  return callMultimodalTranscription(
    safetyNetModel,
    audio,
    mimeType,
    filename,
    language,
    remaining,
    speakerNames,
    singleSpeaker
  );
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
      ? "The selected output language is Khmer. Return Khmer script only, using modern, natural Khmer as used in Cambodia today. If the raw transcript contains English or romanized Khmer, convert its meaning into natural Khmer. Do not rewrite into archaic, overly literary, or old-fashioned Khmer unless the speaker actually used that wording. Keep only proper names, product names, URLs, code terms, and well-known acronyms in their original form."
      : language === "en"
        ? "The selected output language is English. Return English only. If the raw transcript contains Khmer, translate its meaning into natural English. Keep proper names, product names, URLs, code terms, and well-known acronyms in their original form."
        : "The final transcript may contain Khmer and English. Keep each spoken phrase in its original language. Khmer phrases in the raw transcript must remain Khmer script, and English phrases must remain English. Never translate Khmer speech into English or English speech into Khmer in Khmer + English mode.";
  const speakerInstruction = speakerNames.length
    ? `Known speaker names: ${speakerNames.join(", ")}. Preserve any real speaker name that is already present. Convert generic numbered labels only when the mapping is clear from the raw transcript. If a label is unknown or uncertain, keep Unknown Speaker: instead of guessing a real name. Every spoken turn should start with a speaker label, but uncertain speakers must not be forced onto a known participant name. If there is only one known speaker, prefix each spoken line with that speaker name.`
    : "Preserve Speaker 1, Speaker 2 labels if present. Keep self-introduced names inside the spoken sentence, but do not turn those names into speaker labels. Do not invent real person names.";

  const prompt = [
    "You are a careful meeting transcript proofreader.",
    "Clean the raw speech-to-text output into a readable meeting transcript.",
    languageInstruction,
    speakerInstruction,
    "Rules:",
    "- Do not summarize.",
    "- Do not add new facts, decisions, or tasks.",
    "- Do not add words that are not present in the raw transcript.",
    "- Do not complete unclear or broken sentences from context.",
    "- Keep speaker labels at the start of each spoken turn: Name: spoken text.",
    "- Do not combine different speakers into one paragraph.",
    "- For Khmer mode, normalize every clear spoken phrase into Khmer script only.",
    "- For English mode, normalize every clear spoken phrase into English only.",
    "- For Khmer + English mode, preserve each clear phrase in the language that was spoken: Khmer stays Khmer script; English stays English.",
    "- In Khmer + English mode, do not translate Khmer sentences into English to make the transcript mixed. A mixed transcript means mixed because the speakers actually used both languages.",
    "- Standard Khmer writing does not put spaces between the words of a sentence (only between separate phrases/clauses, around numerals, and around embedded English/Latin terms). The raw transcript below was produced by a speech recognizer that space-separates every syllable/word - rejoin those into normal, correctly-spaced Khmer script rather than copying its spacing.",
    "- Keep the speaker's wording and word order as close as possible to the raw transcript.",
    "- Do not rewrite awkward, informal, repeated, or broken speech into a polished sentence.",
    "- Preserve all real spoken content, including short replies, hesitations, repeated words, corrections, names, numbers, dates, and question endings.",
    "- Treat [unclear] as evidence from the audio; preserve it exactly and do not replace it with a guessed phrase.",
    "- Multi-word proper/product/brand names (e.g. company names, app names, payment providers) must stay complete and exact - never drop, shorten, merge, or transliterate part of a multi-word name. If the raw transcript already has the full name (e.g. \"ABA PayWay\"), never shorten it (e.g. to \"ABA Pay\") even if it looks redundant.",
    "- Remove hallucinated words, timestamp-only lines, exact duplicate adjacent lines, and obvious non-speech boilerplate.",
    "- If a phrase is unclear, write [unclear] instead of guessing.",
    "- Return transcript text only.",
    "",
    "Raw transcript:",
    clean
  ].join("\n");

  // Cleanup output should never be much longer than the raw input it's
  // rejoining - without a cap, a large or repetitive chunk (confirmed live:
  // a real ~30k-char chunk from a looping test call never returned at all,
  // even given 100s) can send the model into a very long or runaway
  // completion that blows the request's own timeout regardless how
  // generous it is. ~1 token per 2 raw chars is already generous headroom
  // over the input length.
  const maxTokens = Math.min(16000, Math.max(1000, Math.ceil(clean.length / 2) + 500));

  return generateOpenRouterContent([{ text: prompt }], {
    model: textModel(),
    temperature: 0,
    timeoutMs,
    maxTokens
  });
}

// Detects real names from explicit self-introductions (e.g. "ខ្ញុំឈ្មោះ...",
// "my name is...") so a recording can be labeled without the user typing
// participant names first. Deliberately narrow and separate from the main
// refine pass: an earlier attempt at asking one model call to both detect
// AND consistently relabel a whole transcript in one shot produced a
// confirmed-live wrong-attribution (a line was relabeled with a name that
// belonged to a *different* speaker) - worse than the generic "Speaker 1"
// label it replaced. Isolating extraction into its own low-stakes call and
// feeding the result through the existing, already-relied-upon "known
// speaker names, assign by first-seen order" mechanism (refineOpenRouterTranscript's
// speakerNames branch, transcriptionChatPrompt's knownSpeakerInstruction)
// means a bad detection only falls back to the same generic labels that
// already ship today, never a confident wrong name.
export async function detectSelfIntroducedSpeakerNames(
  transcript: string,
  timeoutMs = 20000
): Promise<string[]> {
  if (!hasOpenRouterKey()) return [];
  const clean = transcript.trim();
  if (!clean) return [];

  const labelMatches = [...clean.matchAll(/^\s*Speaker\s+(\d+)\s*:/gim)];
  const labelNumbers = [...new Set(labelMatches.map((match) => Number(match[1])))].sort((a, b) => a - b);
  // Nothing to relabel - either already has real names, or no generic
  // labels at all (e.g. a single continuous voice with no speaker prefix).
  if (!labelNumbers.length) return [];

  const prompt = [
    "You are given a raw meeting transcript that uses generic speaker labels: Speaker 1, Speaker 2, etc.",
    "For each generic label, check whether that exact speaker clearly states their own name as a self-introduction somewhere in their lines - for example Khmer phrases like \"ខ្ញុំឈ្មោះ...\", \"ខ្ញុំជា...\", or English phrases like \"my name is...\", \"I am...\", \"I'm...\", \"this is...\".",
    "Only report a name when it is explicitly and unambiguously self-introduced by that speaker. Never guess a name from role, topic, tone, or how someone is addressed by another speaker.",
    "If a label's self-introduction is missing, unclear, contradictory (introduces more than one different name), or you are not confident, omit that label entirely rather than guessing.",
    `The generic labels present in this transcript are: ${labelNumbers.map((n) => `Speaker ${n}`).join(", ")}.`,
    "Return only a JSON object whose keys are exactly those generic labels (only the ones you are confident about) and whose values are the introduced name, for example {\"Speaker 1\": \"ដារ៉ា\"}. Return {} if none are confident.",
    "",
    "Transcript:",
    clean
  ].join("\n");

  try {
    const raw = await generateOpenRouterContent([{ text: prompt }], {
      model: textModel(),
      json: true,
      temperature: 0,
      timeoutMs,
      maxTokens: 500
    });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const detected = new Map<number, string>();
    for (const [label, name] of Object.entries(parsed)) {
      const match = label.trim().match(/^Speaker\s+(\d+)$/i);
      if (!match || typeof name !== "string") continue;
      const trimmedName = name.trim();
      if (!trimmedName || trimmedName.length > 60) continue;
      detected.set(Number(match[1]), trimmedName);
    }
    // Only usable if EVERY generic label seen in the transcript has a
    // confident name - the downstream "known speaker names, assign by
    // order" mechanism is positional (Speaker 1 = names[0], Speaker 2 =
    // names[1], ...) and has no way to represent "this one stays generic."
    // A partial map would force an unintroduced speaker's real turns onto
    // someone else's name, which is the exact wrong-attribution failure
    // mode this function exists to avoid.
    if (detected.size !== labelNumbers.length) return [];
    return labelNumbers.map((n) => detected.get(n)!);
  } catch {
    return [];
  }
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

export async function generateSlideBullets(summary: string, language: DocumentLanguageMode = "km") {
  if (!summary.trim()) throw new Error("Summary is empty.");
  if (!hasOpenRouterKey()) return summary;
  return generateOpenRouterContent([{ text: buildSlideBulletsPrompt(summary, language) }], {
    temperature: 0.2,
    timeoutMs: 45000,
    maxTokens: 1200
  });
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
