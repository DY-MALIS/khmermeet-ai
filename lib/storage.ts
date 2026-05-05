import { mkdir, writeFile } from "fs/promises";
import path from "path";

const uploadRoot = path.join(process.cwd(), "uploads");

export async function saveLocalAudio(file: File) {
  await mkdir(uploadRoot, { recursive: true });
  const ext = file.type.includes("webm") ? "webm" : "audio";
  const name = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const fullPath = path.join(uploadRoot, name);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, bytes);
  // TODO: Cloud storage - replace this adapter with S3 or Supabase Storage.
  return `/api/uploads/${name}`;
}

export async function transcribeAudio(_audioFile: File) {
  void _audioFile;
  // TODO: Real-time speech-to-text and Whisper integration.
  // TODO: Speaker detection.
  throw new Error("Speech-to-text is not implemented yet. Paste transcript manually for this MVP.");
}
