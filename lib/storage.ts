import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { generateGeminiContent, transcriptionModel } from "@/lib/ai/gemini";
import { prisma } from "@/lib/prisma";

const uploadRoot = process.env.VERCEL ? path.join("/tmp", "khmermeet-uploads") : path.join(process.cwd(), "uploads");
const databaseAudioLimit = 12 * 1024 * 1024;

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
    .join("\n")
    .trim();

  return noSpeechPatterns.some((pattern) => pattern.test(cleaned)) ? "" : cleaned;
}

export function getLocalAudioPath(name: string) {
  return path.join(uploadRoot, path.basename(name));
}

export async function saveLocalAudio(file: File) {
  const ext = file.type.includes("mp4") ? "m4a" : file.type.includes("webm") ? "webm" : "audio";
  const name = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const supabaseUrl = await saveSupabaseAudio(name, file.type || "audio/webm", bytes);
  if (supabaseUrl) return supabaseUrl;

  if (process.env.VERCEL) {
    if (bytes.length > databaseAudioLimit) {
      throw new Error("Audio file is too large for MVP database storage. Please record a shorter clip or connect Supabase Storage/S3.");
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

function contentTypeFromPath(objectPath: string) {
  if (objectPath.endsWith(".mp4") || objectPath.endsWith(".m4a")) return "audio/mp4";
  if (objectPath.endsWith(".webm")) return "audio/webm";
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

export async function transcribeAudio(audioFile: File, speakerNames: string[] = []) {
  // TODO: Real-time speech-to-text streaming.
  // TODO: Speaker detection.
  if (!process.env.GEMINI_API_KEY) return "";
  if (audioFile.size > 20 * 1024 * 1024) {
    throw new Error("Audio is larger than the 20 MB Gemini inline transcription limit.");
  }

  const knownSpeakers = speakerNames.length ? ` Known participant names: ${speakerNames.join(", ")}.` : "";
  const prompt = [
    "This is a Cambodian team meeting with Khmer and English speakers. The meeting may switch between Khmer and English at any time.",
    "Detect Khmer and English automatically in the same audio. Do not force everything into one language.",
    "Do not translate between languages. If a person speaks Khmer, write Khmer script. If a person speaks English, write English. If they mix Khmer and English, keep the mixed language exactly.",
    "This audio may be one live meeting chunk, so it may start or end in the middle of a sentence.",
    "For short chunks, return any audible words even if the sentence is incomplete.",
    "Transcribe the full audio as completely as possible.",
    "Transcribe verbatim. Do not summarize, translate, rewrite, or skip repeated words.",
    "Return only transcript text. Do not include explanations, analysis, confidence notes, or phrases like 'No clear speech detected'.",
    "If there is truly no speech, return an empty string.",
    "Do not invent speakers, names, or dialogue. Only write words actually heard in this audio.",
    "Keep Khmer words in Khmer script and English words in English.",
    "Preserve names, product terms, dates, numbers, deadlines, and action items exactly as spoken.",
    "If the audio contains pauses, continue transcribing after every pause.",
    "If a word is unclear, write the most likely heard word, but never invent a full sentence.",
    "Add punctuation only when it helps readability.",
    knownSpeakers,
    'When a speaker can be identified, prefix the line with the speaker name like "Name: transcript". If unclear, use "Speaker: transcript".'
  ].filter(Boolean).join(" ");
  const audioBase64 = Buffer.from(await audioFile.arrayBuffer()).toString("base64");

  const transcript = await generateGeminiContent(
    [
      { text: prompt },
      {
        inlineData: {
          mimeType: audioFile.type || "audio/webm",
          data: audioBase64
        }
      }
    ],
    { model: transcriptionModel(), temperature: 0 }
  );
  return cleanTranscriptionText(transcript);
}
