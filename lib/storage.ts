import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  deleteGeminiFile,
  generateGeminiContent,
  transcriptionModel,
  uploadGeminiFile,
  waitForGeminiFileActive
} from "@/lib/ai/gemini";
import { prisma } from "@/lib/prisma";
import { isTimestampOnlyTranscript } from "@/lib/transcript-quality";

const uploadRoot = process.env.VERCEL ? path.join("/tmp", "khmermeet-uploads") : path.join(process.cwd(), "uploads");
const databaseAudioLimit = 12 * 1024 * 1024;

export type TranscriptionLanguageMode = "km" | "en" | "mixed";
type TranscriptionOptions = {
  timeoutMs?: number;
  mode?: "final" | "live";
};

export function normalizeTranscriptionLanguageMode(value: unknown): TranscriptionLanguageMode {
  if (value === "km" || value === "km-KH" || value === "khmer") return "km";
  if (value === "en" || value === "en-US" || value === "english") return "en";
  if (value === "mixed" || value === "km-en" || value === "en-km") return "mixed";
  return "mixed";
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

function languageModePrompt(languageMode: TranscriptionLanguageMode) {
  if (languageMode === "km") {
    return [
      "The selected transcript language is Khmer.",
      "This is transcription, not translation.",
      "Write Khmer speech in Khmer script.",
      "Do not romanize Khmer. Do not write Khmer pronunciation in English letters.",
      "Do not translate Khmer into English.",
      "Do not add English words unless the speaker clearly says an English product name, acronym, URL, number, person name, brand, or technical term.",
      "If the speaker says English words inside a Khmer sentence, keep those exact English words only."
    ];
  }

  if (languageMode === "en") {
    return [
      "The selected transcript language is English.",
      "This is transcription, not translation.",
      "Write English speech in English only.",
      "Do not translate English into Khmer.",
      "Do not add Khmer words unless the speaker clearly says a Khmer person name, place name, organization name, or Khmer term.",
      "If the speaker says Khmer words inside an English sentence, keep those exact Khmer words only."
    ];
  }

  return [
    "The selected transcript language is mixed Khmer and English.",
    "This is transcription, not translation.",
    "Detect Khmer and English automatically in the same audio.",
    "If a person speaks Khmer, write Khmer script. If a person speaks English, write English. If they truly mix Khmer and English, keep the mixed language exactly.",
    "Do not romanize Khmer. Do not translate English to Khmer. Do not translate Khmer to English.",
    "Do not force everything into one language."
  ];
}

export async function transcribeAudio(
  audioFile: File,
  speakerNames: string[] = [],
  languageMode: TranscriptionLanguageMode = "mixed",
  options: TranscriptionOptions = {}
) {
  // TODO: Real-time speech-to-text streaming.
  // TODO: Speaker detection.
  if (!process.env.GEMINI_API_KEY) return "";
  const useGeminiFileApi = options.mode !== "live";
  if (!useGeminiFileApi && audioFile.size > 20 * 1024 * 1024) {
    throw new Error("Audio is larger than the 20 MB Gemini inline transcription limit.");
  }

  const normalizedLanguageMode = normalizeTranscriptionLanguageMode(languageMode);
  const knownSpeakers = speakerNames.length
    ? [
        `Known participant names: ${speakerNames.join(", ")}.`,
        "Use a known participant name only when the voice is clearly that person.",
        'If the speaker is unclear, use "Speaker:" instead of guessing a name.'
      ]
    : [
        "Do not add speaker labels unless there are clearly different voices.",
        'If one person is speaking and the name is unknown, return only the spoken words without "Speaker:" labels.'
      ];
  const prompt = [
    "You are a careful speech-to-text engine for Cambodian team meetings.",
    "Your job is to transcribe speech from audio into text. This is not translation and not summarization.",
    ...languageModePrompt(normalizedLanguageMode),
    options.mode === "live"
      ? "This is a short live audio chunk. It may start or end in the middle of a sentence."
      : "This may be a saved meeting recording. Transcribe the whole audio from start to end.",
    "Return every clearly audible word. Include words after pauses and do not stop early.",
    "For short chunks, return audible words even when the sentence is incomplete.",
    "Transcribe verbatim. Do not summarize, translate, rewrite, paraphrase, or skip repeated words.",
    "Write only the actual words spoken by participants.",
    "Never output timestamps, second counters, timecodes, beat markers, or placeholder text such as 00:01 00:02 00:03.",
    "Return only transcript text. Do not include explanations, analysis, confidence notes, or phrases like 'No clear speech detected'.",
    "If there is truly no audible speech, return an empty string instead of timestamps or guesses.",
    "Do not invent speakers, names, or dialogue. Only write words actually heard in this audio.",
    "Do not split one speaker into multiple Speaker 1/Speaker 2 labels unless different voices are clearly audible.",
    "Preserve names, product terms, dates, numbers, deadlines, and action items exactly as spoken.",
    "If the audio contains pauses, continue transcribing after every pause.",
    "If a word is unclear, write the most likely heard word, but never invent a full sentence.",
    "Add punctuation only when it helps readability.",
    ...knownSpeakers,
    speakerNames.length
      ? 'When a speaker can be identified, prefix the line with the speaker name like "Name: transcript".'
      : "Do not invent Speaker 1, Speaker 2, or Speaker 3 labels."
  ].filter(Boolean).join(" ");
  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
  const mimeType = audioFile.type || "audio/webm";
  const timeoutMs = options.timeoutMs ?? Number(process.env.GEMINI_TRANSCRIBE_TIMEOUT_MS ?? 55000);
  let uploadedFileName = "";

  try {
    const audioPart = useGeminiFileApi
      ? await (async () => {
          const uploaded = await uploadGeminiFile(audioBuffer, mimeType, audioFile.name || "meeting-audio");
          uploadedFileName = uploaded.name;
          const active = await waitForGeminiFileActive(uploaded, Math.min(timeoutMs, 60000));
          return { fileData: { mimeType: active.mimeType, fileUri: active.uri } };
        })()
      : {
          inlineData: {
            mimeType,
            data: audioBuffer.toString("base64")
          }
        };

    const transcript = await generateGeminiContent(
      [
        { text: prompt },
        audioPart
      ],
      {
        model: transcriptionModel(),
        temperature: 0,
        timeoutMs
      }
    );
    const cleaned = cleanTranscriptionText(transcript);
    if (cleaned || options.mode === "live") return cleaned;

    const retryTranscript = await generateGeminiContent(
      [
        {
          text: [
            prompt,
            "Retry carefully. The previous attempt did not produce usable spoken words.",
            "Ignore silence, music, room noise, and timer-like sounds.",
            "Listen for Khmer and English speech and return only the words that are clearly spoken."
          ].join(" ")
        },
        audioPart
      ],
      {
        model: transcriptionModel(),
        temperature: 0,
        timeoutMs
      }
    );
    return cleanTranscriptionText(retryTranscript);
  } finally {
    if (uploadedFileName) {
      await deleteGeminiFile(uploadedFileName);
    }
  }
}

export async function transcribeAudioChunks(
  audioChunks: File[],
  speakerNames: string[] = [],
  languageMode: TranscriptionLanguageMode = "mixed"
) {
  const usableChunks = audioChunks.filter((chunk) => chunk.size > 0).slice(0, 40);
  if (!usableChunks.length) return "";

  const transcripts: string[] = [];
  for (const chunk of usableChunks) {
    const text = await transcribeAudio(chunk, speakerNames, languageMode, {
      mode: "live",
      timeoutMs: Math.min(Number(process.env.GEMINI_TRANSCRIBE_TIMEOUT_MS ?? 55000), 35000)
    });
    if (text && !isTimestampOnlyTranscript(text)) transcripts.push(text);
  }

  return cleanTranscriptionText(transcripts.join("\n"));
}
