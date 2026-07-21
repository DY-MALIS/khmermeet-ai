import { mkdir, readFile, writeFile } from "fs/promises";
import { unlink } from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  OpenRouterApiError,
  hasOpenRouterKey,
  refineOpenRouterTranscript,
  transcribeOpenRouterAudio,
  transcribeOpenRouterAudioViaChat
} from "@/lib/ai/openrouter";
import { prisma } from "@/lib/prisma";
import { hasUsableTranscript, isTimestampOnlyTranscript } from "@/lib/transcript-quality";

const uploadRoot = process.env.VERCEL ? path.join("/tmp", "khmermeet-uploads") : path.join(process.cwd(), "uploads");
// Vercel Serverless Functions (Route Handlers) hard-cap the request body at 4.5MB.
// A request larger than that is rejected by the platform before this code runs,
// so this limit must stay below 4.5MB to ever actually trigger.
const databaseAudioLimit = 4 * 1024 * 1024;
const openRouterAudioLimit = 24 * 1024 * 1024;

export type TranscriptionLanguageMode = "km" | "en" | "km-en";
type TranscriptionOptions = {
  timeoutMs?: number;
  mode?: "final" | "live";
};

export function normalizeTranscriptionLanguageMode(value: unknown): TranscriptionLanguageMode {
  if (value === "km" || value === "km-KH" || value === "khmer") return "km";
  if (value === "en" || value === "en-US" || value === "english") return "en";
  if (
    value === "km-en" ||
    value === "mixed" ||
    value === "mixed-khmer-english" ||
    value === "khmer-english"
  ) {
    return "km-en";
  }
  return "km";
}

function cleanTranscriptionText(text: string) {
  const noSpeechPatterns = [
    /no clear speech detected/i,
    /there is no discernible speech/i,
    /no discernible speech/i,
    /provided audio/i,
    /cannot transcribe/i,
    /unable to transcribe/i,
    /there is no speech/i,
    /no speech detected/i
  ];

  const cleaned = text
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !noSpeechPatterns.some((pattern) => pattern.test(line)))
    .filter((line) => !/^speaker\s*\d+\s*:\s*$/i.test(line))
    .filter((line) => !isTimestampOnlyTranscript(line))
    .join("\n")
    .trim();

  if (noSpeechPatterns.some((pattern) => pattern.test(cleaned))) return "";
  if (isTimestampOnlyTranscript(cleaned)) return "";
  return cleaned;
}

export function getLocalAudioPath(name: string) {
  return path.join(uploadRoot, path.basename(name));
}

export async function loadStoredAudioAsFile(audioUrl: string) {
  const normalizedUrl = audioUrl.trim();
  if (!normalizedUrl) throw new Error("Missing audio URL.");

  if (normalizedUrl.startsWith("/api/uploads/")) {
    const idOrName = path.basename(decodeURIComponent(normalizedUrl.split("?")[0]));
    const dbAudio = await prisma.audioFile.findUnique({ where: { id: idOrName } }).catch(() => null);
    if (dbAudio) {
      return new File([Buffer.from(dbAudio.data)], dbAudio.filename, { type: dbAudio.mimeType });
    }

    const data = await readFile(getLocalAudioPath(idOrName));
    return new File([data], idOrName, { type: contentTypeFromPath(idOrName) });
  }

  if (normalizedUrl.startsWith("/api/storage/")) {
    const objectPath = normalizedUrl
      .replace(/^\/api\/storage\//, "")
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    const file = await downloadSupabaseAudio(objectPath);
    return new File([file.data], path.basename(objectPath), { type: file.mimeType });
  }

  if (/^https?:\/\//i.test(normalizedUrl)) {
    const response = await fetch(normalizedUrl);
    if (!response.ok) throw new Error("Could not download audio for transcription.");
    const data = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || contentTypeFromPath(normalizedUrl);
    return new File([data], path.basename(new URL(normalizedUrl).pathname) || "meeting-audio", { type: contentType });
  }

  throw new Error("Unsupported audio storage path.");
}

export async function deleteStoredAudio(audioUrl: string | null | undefined) {
  const normalizedUrl = audioUrl?.trim();
  if (!normalizedUrl) return;

  if (normalizedUrl.startsWith("/api/uploads/")) {
    const idOrName = path.basename(decodeURIComponent(normalizedUrl.split("?")[0]));
    const dbAudio = await prisma.audioFile.delete({ where: { id: idOrName } }).catch(() => null);
    if (dbAudio) return;
    await unlink(getLocalAudioPath(idOrName)).catch(() => undefined);
    return;
  }

  if (normalizedUrl.startsWith("/api/storage/")) {
    const storage = supabaseStorageClient();
    if (!storage) return;
    const objectPath = normalizedUrl
      .replace(/^\/api\/storage\//, "")
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    await storage.client.storage.from(storage.bucket).remove([objectPath]);
  }
}

export async function saveLocalAudio(file: File) {
  const ext = file.type.includes("video/mp4")
    ? "mp4"
    : file.type.includes("mp4")
      ? "m4a"
      : file.type.includes("webm")
        ? "webm"
        : file.type.includes("mpeg")
          ? "mp3"
          : "audio";
  const name = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const supabaseUrl = await saveSupabaseAudio(name, file.type || "audio/webm", bytes);
  if (supabaseUrl) return supabaseUrl;

  if (process.env.VERCEL) {
    if (bytes.length > databaseAudioLimit) {
      throw new Error(
        `Recording is ${(bytes.length / (1024 * 1024)).toFixed(1)}MB, which is over the ${(databaseAudioLimit / (1024 * 1024)).toFixed(0)}MB upload limit on this server. Please record a shorter clip, lower the recording quality, or connect Supabase Storage for larger uploads.`
      );
    }
    const audio = await createAudioFileRecord(name, file.type || "audio/webm", bytes);
    return `/api/uploads/${audio.id}`;
  }

  await mkdir(uploadRoot, { recursive: true });
  const fullPath = getLocalAudioPath(name);
  await writeFile(fullPath, bytes);
  return `/api/uploads/${name}`;
}

function supabaseStorageConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "meeting-recordings";
  if (!url || !serviceRoleKey || !bucket) return null;
  return { url, serviceRoleKey, bucket };
}

function supabaseStorageClient() {
  const config = supabaseStorageConfig();
  if (!config) return null;

  return {
    bucket: config.bucket,
    client: createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  };
}

async function saveSupabaseAudio(filename: string, mimeType: string, data: Buffer) {
  const storage = supabaseStorageClient();
  if (!storage) return "";

  const objectPath = `audio/${new Date().toISOString().slice(0, 10)}/${filename}`;
  const { error } = await storage.client.storage
    .from(storage.bucket)
    .upload(objectPath, data, {
      contentType: mimeType,
      upsert: false
    });

  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  return `/api/storage/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
}

export async function downloadSupabaseAudio(objectPath: string) {
  const storage = supabaseStorageClient();
  if (!storage) throw new Error("Supabase Storage is not configured.");

  const { data, error } = await storage.client.storage.from(storage.bucket).download(objectPath);
  if (error || !data) throw new Error(error?.message || "Storage file not found.");

  const arrayBuffer = await data.arrayBuffer();
  return {
    data: Buffer.from(arrayBuffer),
    mimeType: data.type || contentTypeFromPath(objectPath)
  };
}

export async function listSupabaseStorageFolder(prefix: string) {
  const storage = supabaseStorageClient();
  if (!storage) throw new Error("Supabase Storage is not configured.");

  const { data, error } = await storage.client.storage
    .from(storage.bucket)
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((entry) => entry.id)
    .map((entry) => `${prefix}/${entry.name}`);
}

export async function createSupabaseSignedUrl(objectPath: string, expiresInSeconds = 3600) {
  const storage = supabaseStorageClient();
  if (!storage) throw new Error("Supabase Storage is not configured.");

  const { data, error } = await storage.client.storage
    .from(storage.bucket)
    .createSignedUrl(objectPath, expiresInSeconds);
  if (error || !data) throw new Error(error?.message || "Could not create signed URL.");
  return data.signedUrl;
}

function contentTypeFromPath(objectPath: string) {
  if (objectPath.endsWith(".mp4")) return "video/mp4";
  if (objectPath.endsWith(".m4a")) return "audio/mp4";
  if (objectPath.endsWith(".mp3")) return "audio/mpeg";
  if (objectPath.endsWith(".webm")) return "audio/webm";
  if (objectPath.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}

async function createAudioFileRecord(filename: string, mimeType: string, data: Buffer) {
  try {
    return await prisma.audioFile.create({
      data: {
        filename,
        mimeType,
        data,
        size: data.length
      }
    });
  } catch (error) {
    if (!isMissingAudioFileTable(error)) throw error;
    await ensureAudioFileTable();
    return prisma.audioFile.create({
      data: {
        filename,
        mimeType,
        data,
        size: data.length
      }
    });
  }
}

function isMissingAudioFileTable(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("audiofile") && (message.includes("does not exist") || message.includes("not exist"));
}

async function ensureAudioFileTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AudioFile" (
      "id" TEXT NOT NULL,
      "filename" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "data" BYTEA NOT NULL,
      "size" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AudioFile_pkey" PRIMARY KEY ("id")
    )
  `);
}

export async function transcribeAudio(
  audioFile: File,
  speakerNames: string[] = [],
  languageMode: TranscriptionLanguageMode = "km",
  options: TranscriptionOptions = {}
) {
  // TODO: Real-time speech-to-text streaming.
  // TODO: Speaker detection.
  if (!hasOpenRouterKey()) return "";
  if (audioFile.size > openRouterAudioLimit) {
    throw new Error(
      options.mode === "live"
        ? "This audio segment is larger than the 24 MB OpenRouter transcription limit."
        : "This saved recording is too large to re-transcribe as a single file (OpenRouter's 24 MB limit covers roughly 25-30 minutes of audio). Full-length transcription already runs automatically in small segments while you record, so long meetings are already captured — this button is only reliable for shorter recordings. Open the meeting to review the transcript captured during recording."
    );
  }

  const normalizedLanguageMode = normalizeTranscriptionLanguageMode(languageMode);
  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
  const mimeType = audioFile.type || "audio/webm";
  const filename = audioFile.name || "meeting-audio.webm";
  const timeoutMs = options.timeoutMs ?? Number(process.env.OPEN_ROUTER_TRANSCRIBE_TIMEOUT_MS ?? 55000);

  // google/chirp-3 (the primary STT model) has a confirmed fixed-hallucination
  // bug on Khmer audio: it returns the same fluent, well-formed but entirely
  // fabricated text regardless of what was actually said. That output is not
  // empty, garbled, or repetitive, so no output-based quality check below can
  // catch it - Khmer/mixed audio therefore skips chirp-3 entirely and goes
  // straight to the multimodal chat fallback instead of risking that bug.
  // English still uses chirp-3 first since it's confirmed reliable there.
  let cleanedTranscript = "";
  if (normalizedLanguageMode === "en") {
    let transcript = "";
    try {
      transcript = await transcribeOpenRouterAudio(audioBuffer, mimeType, filename, normalizedLanguageMode, timeoutMs);
    } catch (error) {
      // A 400 means the primary model rejected this specific request -
      // worth retrying with the fallback model below. Other errors (invalid
      // key, no credits, rate limit) won't be fixed by switching models, so
      // let those surface immediately as before.
      if (!(error instanceof OpenRouterApiError) || error.status !== 400) throw error;
    }
    cleanedTranscript = addSingleSpeakerLabel(cleanTranscriptionText(transcript), speakerNames);
  }

  if (!hasUsableTranscript(cleanedTranscript)) {
    const fallbackTranscript = await transcribeOpenRouterAudioViaChat(
      audioBuffer,
      mimeType,
      filename,
      normalizedLanguageMode,
      timeoutMs
    ).catch(() => "");
    const cleanedFallback = addSingleSpeakerLabel(cleanTranscriptionText(fallbackTranscript), speakerNames);
    if (hasUsableTranscript(cleanedFallback)) cleanedTranscript = cleanedFallback;
  }

  if (!cleanedTranscript || options.mode === "live") return cleanedTranscript;
  assertUsableSavedTranscript(cleanedTranscript);

  const refinedTranscript = await refineOpenRouterTranscript(
    cleanedTranscript,
    normalizedLanguageMode,
    normalizeSpeakerNames(speakerNames),
    Math.min(timeoutMs, 55000)
  ).catch(() => cleanedTranscript);

  const cleanedRefinedTranscript = addSingleSpeakerLabel(cleanTranscriptionText(refinedTranscript), speakerNames);
  const bestTranscript = chooseBetterSavedTranscript(cleanedTranscript, cleanedRefinedTranscript);
  assertUsableSavedTranscript(bestTranscript);
  return bestTranscript;
}

export async function transcribeAudioChunks(
  audioChunks: File[],
  speakerNames: string[] = [],
  languageMode: TranscriptionLanguageMode = "km"
) {
  const usableChunks = audioChunks.filter((chunk) => chunk.size > 0).slice(0, 40);
  if (!usableChunks.length) return "";

  const transcripts: string[] = [];
  for (const chunk of usableChunks) {
    const text = await transcribeAudio(chunk, speakerNames, languageMode, {
      mode: "live",
      timeoutMs: Math.min(Number(process.env.OPEN_ROUTER_TRANSCRIBE_TIMEOUT_MS ?? 55000), 35000)
    });
    if (text && !isTimestampOnlyTranscript(text)) transcripts.push(text);
  }

  return cleanTranscriptionText(transcripts.join("\n"));
}

function normalizeSpeakerNames(speakerNames: string[]) {
  return speakerNames
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function addSingleSpeakerLabel(text: string, speakerNames: string[]) {
  const [speakerName] = normalizeSpeakerNames(speakerNames);
  if (!speakerName || !text.trim()) return text;

  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/^[^:\n]{1,60}:\s/.test(line) ? line : `${speakerName}: ${line}`))
    .join("\n");
}

function chooseBetterSavedTranscript(rawTranscript: string, refinedTranscript: string) {
  if (!refinedTranscript.trim()) return rawTranscript;
  if (isLikelyIncompleteTranscript(refinedTranscript)) return rawTranscript;

  const rawScore = transcriptTokenScore(rawTranscript);
  const refinedScore = transcriptTokenScore(refinedTranscript);
  if (rawScore >= 6 && refinedScore < rawScore * 0.6) return rawTranscript;

  return refinedTranscript;
}

function assertUsableSavedTranscript(transcript: string) {
  if (!isLikelyIncompleteTranscript(transcript)) return;
  throw new Error(
    "No clear speech text was detected. Please check the audio, microphone, selected language, or OpenRouter credits/key, then try again."
  );
}

function isLikelyIncompleteTranscript(transcript: string) {
  const clean = transcript.trim();
  if (!clean || isTimestampOnlyTranscript(clean)) return true;

  const lower = clean.toLowerCase();
  if (
    lower.includes("no clear speech") ||
    lower.includes("no discernible speech") ||
    lower.includes("there is no discernible speech") ||
    lower.includes("silence") ||
    lower.includes("no speech detected") ||
    clean.includes("មិនមានសំឡេង") ||
    clean.includes("មិនច្បាស់ទាំងអស់")
  ) {
    return true;
  }

  return false;
}

function transcriptTokenScore(transcript: string) {
  const latinWords = transcript.match(/[A-Za-z0-9][A-Za-z0-9'_-]*/g)?.length ?? 0;
  const khmerChars = transcript.match(/[\u1780-\u17FF]/g)?.length ?? 0;
  return latinWords + Math.ceil(khmerChars / 6);
}
