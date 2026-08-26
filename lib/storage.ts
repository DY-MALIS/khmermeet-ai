import { mkdir, readFile, writeFile } from "fs/promises";
import { unlink } from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  hasOpenRouterKey,
  refineOpenRouterTranscript,
  transcribeOpenRouterAudioViaChat
} from "@/lib/ai/openrouter";
import { prisma } from "@/lib/prisma";
import { hasTranscriptionPromptLeakage, hasUsableTranscript, isTimestampOnlyTranscript } from "@/lib/transcript-quality";

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
  // True when audioFile is known in advance to be one specific person's own
  // microphone track (client-mesh Server Rec's per-participant segments) -
  // stops the model from hallucinating a "Speaker 2:" turn inside audio
  // that is provably a single continuous voice.
  singleSpeaker?: boolean;
  // English audio otherwise always tries google/chirp-3 first. Confirmed
  // live that chirp-3 reliably rejects longer clips (~2min+ tested) with a
  // 400 - the multimodal fallback below still recovers correctly, but only
  // after wasting 60-90s on the doomed chirp-3 attempt first. Long/full-
  // call recordings (lib/storage.ts transcribeStoredTrackRecording) know in
  // advance they don't fit chirp-3's window, so they skip straight to the
  // fallback instead of paying that cost on every chunk.
  skipPrimaryModel?: boolean;
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

// Standard Khmer writing has no spaces between the letters of a word (only
// between phrases/clauses); speech-recognition output routinely comes back
// with every syllable space-separated instead. Asking the refine LLM to fix
// this via prompt instructions alone proved unreliable in testing (real
// output: it left spacing untouched even when explicitly told to rejoin
// it). This is a mechanical Unicode-range fact, not a judgment call, so fix
// it deterministically instead: collapse whitespace strictly between two
// Khmer letter/vowel-sign characters (U+1780-U+17D3), which excludes Khmer
// punctuation (។ etc., U+17D4+) and digits so sentence breaks and numbers
// keep their spacing. Applied here so every transcription path gets it,
// not just the ones that go through the refine LLM pass.
function rejoinKhmerWordSpacing(text: string) {
  return text.replace(/([ក-៓])[ \t]+(?=[ក-៓])/g, "$1");
}

function cleanTranscriptionText(text: string) {
  if (hasTranscriptionPromptLeakage(text)) return "";
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
  return rejoinKhmerWordSpacing(cleaned);
}

export function applyKnownSpeakerLabels(transcript: string, speakerNames: string[]) {
  const names = normalizeSpeakerNames(speakerNames);
  if (!names.length || !transcript.trim()) return transcript;

  let nextUnidentifiedSpeaker = 0;
  let lastSpeaker = "";
  return transcript
    .split(/\n+/)
    .map((line) => {
      const numberedMatch = line.match(/^(?:Speaker|Participant|User|អ្នកនិយាយ|អ្នកចូលរួម)\s*([0-9០-៩]+)\s*[:：]\s*(.*)$/i);
      if (numberedMatch) {
        const speakerIndex = speakerNumberToIndex(numberedMatch[1]);
        const fallbackIndex = Number.isFinite(speakerIndex)
          ? ((speakerIndex % names.length) + names.length) % names.length
          : 0;
        const speakerName = names[speakerIndex] ?? names[fallbackIndex];
        lastSpeaker = speakerName;
        return `${speakerName}: ${numberedMatch[2].trim()}`;
      }

      const knownSpeaker = names.find((name) =>
        new RegExp(`^${escapeRegExp(name)}\\s*[:：]`, "i").test(line)
      );
      if (knownSpeaker) {
        lastSpeaker = knownSpeaker;
        return line.replace(
          new RegExp(`^${escapeRegExp(knownSpeaker)}\\s*[:：]\\s*`, "i"),
          `${knownSpeaker}: `
        );
      }

      const unidentifiedMatch = line.match(
        /^(?:Unknown\s+Speaker|Unknown|Speaker|Participant|User|អ្នកនិយាយមិនស្គាល់|អ្នកនិយាយ|អ្នកចូលរួម)\s*[:：]\s*(.*)$/i
      );
      if (unidentifiedMatch) {
        const speakerName = names[nextUnidentifiedSpeaker % names.length];
        nextUnidentifiedSpeaker += 1;
        lastSpeaker = speakerName;
        return `${speakerName}: ${unidentifiedMatch[1].trim()}`;
      }

      // The transcription prompt requests one turn per line. If a provider
      // omits the label anyway, keep the continuation with the previous
      // speaker (or the first supplied participant for the first line) so the
      // saved transcript always has the requested "Name: speech" shape.
      const speakerName = lastSpeaker || names[0];
      lastSpeaker = speakerName;
      return `${speakerName}: ${line.trim()}`;
    })
    .join("\n")
    .trim();
}

function speakerNumberToIndex(value: string) {
  const normalized = value.replace(/[០-៩]/g, (digit) => String("០១២៣៤៥៦៧៨៩".indexOf(digit)));
  return Number(normalized) - 1;
}

export function forceSingleSpeakerLabel(transcript: string, speakerName: string) {
  const name = speakerName.trim();
  if (!name || !transcript.trim()) return transcript;

  return transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const withoutGenericSpeaker = line
        .replace(/^(?:Speaker|Participant|User|អ្នកនិយាយ|អ្នកចូលរួម)\s*(?:[0-9០-៩]+)?\s*[:：]\s*/i, "")
        .trim();
      const withoutMatchingName = withoutGenericSpeaker.replace(new RegExp(`^${escapeRegExp(name)}\\s*:\\s*`, "i"), "").trim();
      return withoutMatchingName ? `${name}: ${withoutMatchingName}` : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

export async function saveSupabaseAudio(filename: string, mimeType: string, data: Buffer) {
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

// Lets the browser upload the final recording blob directly to Supabase
// Storage, bypassing Vercel's hard 4.5MB request-body ceiling entirely
// (see the comment on `databaseAudioLimit` above) - the signed token
// authorizes that one upload on its own, no RLS policy needed
// (see @supabase/storage-js's `uploadToSignedUrl` docs: "RLS policy
// permissions required: none").
export async function createSupabaseUploadTicket(filename: string) {
  const config = supabaseStorageConfig();
  const storage = supabaseStorageClient();
  if (!config || !storage) return null;

  // Best-effort: raise the bucket's file size limit so a multi-hour
  // recording isn't rejected by whatever default is set on the project.
  // Not fatal if the service role key can't do this for any reason.
  // `public: false` matches this app's documented setup (a private bucket
  // accessed only through signed URLs / the service role key) - passed
  // explicitly since the SDK requires it on every updateBucket call.
  await storage.client.storage.updateBucket(storage.bucket, { public: false, fileSizeLimit: "2GB" }).catch(() => undefined);

  const objectPath = `audio/${new Date().toISOString().slice(0, 10)}/${filename}`;
  const { data, error } = await storage.client.storage.from(storage.bucket).createSignedUploadUrl(objectPath);
  if (error || !data) throw new Error(error?.message || "Could not create an upload ticket.");

  return {
    bucket: storage.bucket,
    supabaseUrl: config.url,
    objectPath,
    token: data.token,
    audioUrl: `/api/storage/${objectPath.split("/").map(encodeURIComponent).join("/")}`
  };
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

  // All languages use the configured multimodal transcription model
  // (default: google/gemini-3.7-flash). Keeping one audio-grounded path
  // across Khmer, English, and mixed meetings avoids switching English-only
  // recordings through a separate STT model with different behavior.
  let cleanedTranscript = "";

  if (!hasUsableTranscript(cleanedTranscript)) {
    // No .catch() here: an OpenRouterApiError (invalid key, no credits, rate
    // limit) must propagate so the caller reports the real cause instead of
    // the generic "no clear speech detected" message, which was silently
    // masking account/billing errors as an audio-quality problem.
    const fallbackTranscript = await transcribeOpenRouterAudioViaChat(
      audioBuffer,
      mimeType,
      filename,
      normalizedLanguageMode,
      timeoutMs,
      normalizeSpeakerNames(speakerNames),
      options.singleSpeaker ?? false
    );
    const cleanedFallback = applyKnownSpeakerLabels(
      addSingleSpeakerLabel(cleanTranscriptionText(fallbackTranscript), speakerNames),
      speakerNames
    );
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

  const cleanedRefinedTranscript = applyKnownSpeakerLabels(
    addSingleSpeakerLabel(cleanTranscriptionText(refinedTranscript), speakerNames),
    speakerNames
  );
  const bestTranscript = chooseBetterSavedTranscript(cleanedTranscript, cleanedRefinedTranscript, normalizedLanguageMode);
  assertUsableSavedTranscript(bestTranscript);
  return bestTranscript;
}

function audioExtensionFromMime(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

// Transcribe one complete recording in one model request so the model keeps
// full sentence and speaker-turn context. Files above OpenRouter's request
// size ceiling are re-encoded to a smaller mono speech file, never split.
// The original saved recording is not modified.
export async function transcribeStoredTrackRecording(
  audioUrl: string,
  languageMode: TranscriptionLanguageMode,
  timeoutMs = 120000,
  options: { speakerNames?: string[]; singleSpeaker?: boolean } = {}
) {
  const file = await loadStoredAudioAsFile(audioUrl);
  // This is always a whole-call recording (minutes to hours), never a
  // short clip - skipPrimaryModel avoids the ~60-90s wasted on chirp-3's
  // confirmed rejection of longer English audio before falling back.
  const speakerNames = normalizeSpeakerNames(options.speakerNames ?? []);
  const transcribeOptions: TranscriptionOptions = {
    mode: "live",
    timeoutMs,
    singleSpeaker: options.singleSpeaker ?? true,
    skipPrimaryModel: true
  };
  const { compressWholeAudioForTranscription } = await import("@/lib/ffmpeg");
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = audioExtensionFromMime(file.type || "audio/webm");
  const transcriptionBuffer = await compressWholeAudioForTranscription(buffer, ext, openRouterAudioLimit);
  const wasCompressed = transcriptionBuffer !== buffer;
  const transcriptionFile = new File(
    [new Uint8Array(transcriptionBuffer)],
    wasCompressed ? "complete-recording.m4a" : file.name,
    { type: wasCompressed ? "audio/mp4" : (file.type || "audio/webm") }
  );
  const transcript = await transcribeAudio(transcriptionFile, speakerNames, languageMode, transcribeOptions);
  return cleanTranscriptionText(transcript);
}

// The live per-chunk transcription path (transcribeAudio with mode:"live",
// used while a recording is in progress) intentionally skips the refine
// pass below for latency - each chunk needs to come back fast while the
// user is still talking. That means the transcript accumulated during a
// normal recording never gets cleaned up: raw STT output for Khmer comes
// back with every syllable space-separated ("សួស្តី ថ្ងៃ នេះ...") instead
// of properly joined words, confirmed in testing. Call this once after all
// chunks are in to run the same refine + quality-guard pass transcribeAudio
// already does for non-live transcriptions, applied to the whole
// accumulated transcript instead of per-chunk.
// A many-hour meeting's full transcript sent as one refine-pass prompt can
// exceed the text model's context window (no chunking existed here at all
// before - confirmed by reading through this file). Speaker turns are
// one-per-line (see cleanTranscriptionText), so splitting on line
// boundaries never cuts a turn in half.
// This was originally 30000, sized only for the context-window limit above -
// but confirmed live against a real 292-segment call transcript that a
// ~30k-char chunk can send this model into an extremely long or fully
// runaway completion (one trial ran 145s and only stopped because it hit
// the token-length ceiling), regardless of how generous a timeout is given.
// 6000-char chunks stayed on a normal, roughly-linear completion time in
// the same test. Smaller chunks means more parallel requests for a long
// meeting, but they run concurrently (Promise.all below), so wall-clock
// time stays close to a single chunk's time either way.
const REFINE_CHUNK_MAX_CHARS = 6000;

function splitTranscriptForRefine(transcript: string, maxChars: number) {
  const lines = transcript.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const line of lines) {
    const lineLength = line.length + 1;
    if (current.length && currentLength + lineLength > maxChars) {
      chunks.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += lineLength;
  }
  if (current.length) chunks.push(current.join("\n"));
  return chunks;
}

export async function refineSavedTranscript(
  transcript: string,
  languageMode: TranscriptionLanguageMode,
  speakerNames: string[] = [],
  timeoutMs = 55000
) {
  const normalizedLanguageMode = normalizeTranscriptionLanguageMode(languageMode);
  const cleanedTranscript = cleanTranscriptionText(transcript);
  if (!hasUsableTranscript(cleanedTranscript)) return cleanedTranscript;

  const normalizedSpeakerNames = normalizeSpeakerNames(speakerNames);
  const chunks = splitTranscriptForRefine(cleanedTranscript, REFINE_CHUNK_MAX_CHARS);
  const deadline = Date.now() + Math.max(1000, timeoutMs);

  const refinedChunks = await Promise.all(
    chunks.map((chunk) =>
      refineOpenRouterTranscript(
        chunk,
        normalizedLanguageMode,
        normalizedSpeakerNames,
        Math.max(1000, deadline - Date.now())
      ).catch(() => chunk)
    )
  );
  const refinedTranscript = refinedChunks.join("\n");

  const labeledTranscript = applyKnownSpeakerLabels(cleanedTranscript, speakerNames);
  const cleanedRefinedTranscript = applyKnownSpeakerLabels(cleanTranscriptionText(refinedTranscript), speakerNames);
  return chooseBetterSavedTranscript(labeledTranscript, cleanedRefinedTranscript, normalizedLanguageMode);
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
    .slice(0, 100);
}

function addSingleSpeakerLabel(text: string, speakerNames: string[]) {
  const names = normalizeSpeakerNames(speakerNames);
  // Only safe to stamp a name onto unlabeled lines when exactly one speaker
  // is known - with multiple participants there is no way to tell which of
  // them said an unlabeled line, and guessing the first name in the list
  // mislabels everyone else's speech as that one person's.
  if (names.length !== 1 || !text.trim()) return text;
  const [speakerName] = names;

  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const withoutGenericSpeaker = line
        .replace(/^(?:Speaker|Participant|User|អ្នកនិយាយ|អ្នកចូលរួម)\s*(?:[0-9០-៩]+)?\s*[:：]\s*/i, "")
        .trim();
      return /^[^:\n]{1,60}:\s/.test(withoutGenericSpeaker) ? withoutGenericSpeaker : `${speakerName}: ${withoutGenericSpeaker}`;
    })
    .join("\n");
}

function chooseBetterSavedTranscript(
  rawTranscript: string,
  refinedTranscript: string,
  languageMode: TranscriptionLanguageMode
) {
  if (!refinedTranscript.trim()) return rawTranscript;
  if (isLikelyIncompleteTranscript(refinedTranscript)) return rawTranscript;

  const rawScore = transcriptTokenScore(rawTranscript);
  const refinedScore = transcriptTokenScore(refinedTranscript);
  if (rawScore >= 6 && refinedScore < rawScore * 0.6) return rawTranscript;

  // The refine pass is a text-only proofreading step with no access to the
  // audio - for km-en mode it's instructed to keep each phrase in whichever
  // language it was actually spoken in, but a text LLM can silently
  // translate English portions into Khmer instead of preserving them
  // (a known LLM failure mode, distinct from dropping content, so the
  // length-based check above doesn't catch it). A steep drop in Latin/English
  // word count between the raw (audio-grounded) and refined transcript is a
  // reliable signal that happened, so fall back to the raw transcript rather
  // than silently changing what the audio actually said.
  if (languageMode === "km-en") {
    const rawLatinWords = countLatinWords(rawTranscript);
    const refinedLatinWords = countLatinWords(refinedTranscript);
    if (rawLatinWords >= 4 && refinedLatinWords < rawLatinWords * 0.4) return rawTranscript;
  }

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

function countLatinWords(transcript: string) {
  return transcript.match(/[A-Za-z0-9][A-Za-z0-9'_-]*/g)?.length ?? 0;
}

function transcriptTokenScore(transcript: string) {
  const latinWords = countLatinWords(transcript);
  const khmerChars = transcript.match(/[\u1780-\u17FF]/g)?.length ?? 0;
  return latinWords + Math.ceil(khmerChars / 6);
}

