import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { generateGeminiContent, transcriptionModel } from "@/lib/ai/gemini";
import { prisma } from "@/lib/prisma";

const uploadRoot = process.env.VERCEL ? path.join("/tmp", "khmermeet-uploads") : path.join(process.cwd(), "uploads");
const databaseAudioLimit = 12 * 1024 * 1024;

export function getLocalAudioPath(name: string) {
  return path.join(uploadRoot, path.basename(name));
}

export async function saveLocalAudio(file: File) {
  const ext = file.type.includes("mp4") ? "m4a" : file.type.includes("webm") ? "webm" : "audio";
  const name = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

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
  // TODO: Cloud storage - replace this adapter with S3 or Supabase Storage.
  return `/api/uploads/${name}`;
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
    "This audio may be one live meeting chunk, so it may start or end in the middle of a sentence.",
    "For short chunks, return any audible words even if the sentence is incomplete.",
    "Transcribe the full audio as completely as possible.",
    "Transcribe verbatim. Do not summarize, translate, rewrite, or skip repeated words.",
    "Keep Khmer words in Khmer script and English words in English.",
    "Preserve names, product terms, dates, numbers, deadlines, and action items exactly as spoken.",
    "If the audio contains pauses, continue transcribing after every pause.",
    "If a word is unclear, write the most likely word instead of dropping the sentence. Do not return an empty transcript unless there is truly no speech.",
    "Add punctuation only when it helps readability.",
    knownSpeakers,
    'When a speaker can be identified, prefix the line with the speaker name like "Name: transcript". If unclear, use "Speaker: transcript".'
  ].filter(Boolean).join(" ");
  const audioBase64 = Buffer.from(await audioFile.arrayBuffer()).toString("base64");

  return generateGeminiContent(
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
}
