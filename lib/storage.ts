import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { generateGeminiContent, transcriptionModel } from "@/lib/ai/gemini";

const uploadRoot = process.env.VERCEL ? path.join("/tmp", "khmermeet-uploads") : path.join(process.cwd(), "uploads");

export function getLocalAudioPath(name: string) {
  return path.join(uploadRoot, path.basename(name));
}

export async function saveLocalAudio(file: File) {
  await mkdir(uploadRoot, { recursive: true });
  const ext = file.type.includes("mp4") ? "m4a" : file.type.includes("webm") ? "webm" : "audio";
  const name = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const fullPath = getLocalAudioPath(name);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, bytes);
  // TODO: Cloud storage - replace this adapter with S3 or Supabase Storage.
  return `/api/uploads/${name}`;
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
    "This is a Cambodian team meeting with Khmer and English speakers.",
    "This audio may be one live meeting chunk, so it may start or end in the middle of a sentence.",
    "Transcribe the full audio as completely as possible.",
    "Transcribe verbatim. Do not summarize, translate, rewrite, or skip repeated words.",
    "Keep Khmer words in Khmer script and English words in English.",
    "Preserve names, product terms, dates, numbers, deadlines, and action items exactly as spoken.",
    "If the audio contains pauses, continue transcribing after every pause.",
    "If a word is unclear, write the most likely word instead of dropping the sentence.",
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
