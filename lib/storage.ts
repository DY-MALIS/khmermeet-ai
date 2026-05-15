import { mkdir, writeFile } from "fs/promises";
import OpenAI from "openai";
import path from "path";

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
  // TODO: Real-time speech-to-text and Whisper integration.
  // TODO: Speaker detection.
  if (!process.env.OPENAI_API_KEY) return "";
  if (audioFile.size > 25 * 1024 * 1024) {
    throw new Error("Audio is larger than the 25 MB transcription limit.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const primaryModel = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";
  const knownSpeakers = speakerNames.length ? ` Known participant names: ${speakerNames.join(", ")}.` : "";
  const prompt = `Cambodian team meeting. Transcribe clearly in Khmer, preserving English product and technical terms when spoken.${knownSpeakers} When a speaker can be identified from context or turn-taking, prefix the line with the speaker name like "Name: transcript". If the speaker is unclear, use "Speaker: transcript".`;

  try {
    const result = await openai.audio.transcriptions.create({
      file: audioFile,
      model: primaryModel,
      language: "km",
      prompt
    });
    return result.text?.trim() ?? "";
  } catch {
    const fallback = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "km",
      prompt
    });
    return fallback.text?.trim() ?? "";
  }
}
