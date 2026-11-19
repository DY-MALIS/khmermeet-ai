import path from "path";
import { measureMediaUsageSeconds } from "@/lib/ffmpeg";
import { loadStoredAudioBytes } from "@/lib/storage";

export async function verifiedStoredAudioUsage(audioUrl: string) {
  const source = await loadStoredAudioBytes(audioUrl);
  const extension = path.extname(new URL(audioUrl, "https://khmermeet.local").pathname).slice(1) || "webm";
  return measureMediaUsageSeconds(source.bytes, extension);
}

export async function verifiedStoredAudioDuration(audioUrl: string) {
  return (await verifiedStoredAudioUsage(audioUrl)).durationSeconds;
}
