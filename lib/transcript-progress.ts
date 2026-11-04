import { hasUsableTranscript, normalizeTranscriptDigits } from "@/lib/transcript-quality";

type SavedAudioChunk = { chunkIndex: number; totalChunks: number; text: string };

// The chunk table has no completion column. Keep the retry state alongside
// its text without exposing this internal marker in the displayed transcript.
export const INCOMPLETE_AUDIO_CHUNK_PREFIX = "[khmermeet-incomplete-window]\n";

export function unpackSavedAudioChunkText(value: string) {
  return value.startsWith(INCOMPLETE_AUDIO_CHUNK_PREFIX)
    ? { text: value.slice(INCOMPLETE_AUDIO_CHUNK_PREFIX.length), incomplete: true }
    : { text: value, incomplete: false };
}

export function assembleSavedAudioChunks(chunks: SavedAudioChunk[]) {
  const totalChunks = Math.max(0, ...chunks.map((chunk) => chunk.totalChunks));
  const saved = chunks
    .filter((chunk) => chunk.chunkIndex >= 0 && chunk.chunkIndex < totalChunks)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
  const usable = saved
    .map((chunk) => unpackSavedAudioChunkText(chunk.text).text)
    .filter((text) => hasUsableTranscript(text));
  return {
    transcript: normalizeTranscriptDigits(usable.map((text) => text.trim()).join("\n")),
    savedChunks: saved.length,
    totalChunks
  };
}
