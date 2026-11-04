// Supabase Free limits each Storage object to at most 50 MB. Keep each part
// well below that ceiling while allowing one meeting recording up to 300 MiB.
export const AUDIO_PART_BYTES = 20 * 1024 * 1024;
export const MAX_DIRECT_AUDIO_BYTES = 300 * 1024 * 1024;
// Vercel Functions cap response bodies at 4.5 MB. Audio playback uses ranges.
export const MAX_AUDIO_RESPONSE_BYTES = 4 * 1024 * 1024;

const manifestPathPattern = /^audio\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\/manifest\.chunks\.json$/;

export type ChunkedAudioManifest = {
  kind: "khmermeet-chunked-audio";
  version: 1;
  size: number;
  mimeType: string;
};

export function isChunkManifestPath(path: string) {
  return manifestPathPattern.test(path);
}

export function audioPartCount(size: number) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_DIRECT_AUDIO_BYTES) {
    throw new Error("Recording must be between 1 byte and 300 MiB.");
  }
  return Math.ceil(size / AUDIO_PART_BYTES);
}

export function audioPartPath(manifestPath: string, index: number) {
  if (!isChunkManifestPath(manifestPath) || !Number.isInteger(index) || index < 0 || index >= 15) {
    throw new Error("Invalid audio part path.");
  }
  return `${manifestPath.slice(0, -"manifest.chunks.json".length)}part-${String(index).padStart(2, "0")}`;
}

export function audioPartSize(totalSize: number, index: number) {
  const count = audioPartCount(totalSize);
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error("Invalid audio part.");
  return Math.min(AUDIO_PART_BYTES, totalSize - index * AUDIO_PART_BYTES);
}

export function parseChunkedAudioManifest(value: unknown, path: string): ChunkedAudioManifest {
  if (!isChunkManifestPath(path) || !value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid chunked audio manifest.");
  }
  const manifest = value as Record<string, unknown>;
  if (manifest.kind !== "khmermeet-chunked-audio" || manifest.version !== 1 ||
      typeof manifest.mimeType !== "string" || manifest.mimeType.length > 100 ||
      !/^(audio|video)\/[a-z0-9.+-]+$/i.test(manifest.mimeType)) {
    throw new Error("Invalid chunked audio manifest.");
  }
  audioPartCount(manifest.size as number);
  return manifest as ChunkedAudioManifest;
}

export function audioResponseRange(header: string | null, size: number) {
  audioPartCount(size);
  if (!header) return { start: 0, end: Math.min(size, MAX_AUDIO_RESPONSE_BYTES) - 1 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const requestedEnd = match[2] && match[1] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) ||
      start >= size || requestedEnd < start || requestedEnd < 0) return null;
  return { start, end: Math.min(requestedEnd, size - 1, start + MAX_AUDIO_RESPONSE_BYTES - 1) };
}
