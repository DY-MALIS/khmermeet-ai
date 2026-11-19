import path from "path";
import { measureMediaDurationSeconds } from "@/lib/ffmpeg";
import { loadStoredAudioBytes } from "@/lib/storage";

export async function verifiedStoredAudioDuration(audioUrl: string) {
  const source = await loadStoredAudioBytes(audioUrl);
  const extension = path.extname(new URL(audioUrl, "https://khmermeet.local").pathname).slice(1) || "webm";
  return measureMediaDurationSeconds(source.bytes, extension);
}
