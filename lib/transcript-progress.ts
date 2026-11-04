import { hasUsableTranscript } from "@/lib/transcript-quality";

type SavedAudioChunk = { chunkIndex: number; totalChunks: number; text: string };

export function assembleSavedAudioChunks(chunks: SavedAudioChunk[]) {
  const totalChunks = Math.max(0, ...chunks.map((chunk) => chunk.totalChunks));
  const saved = chunks
    .filter((chunk) => chunk.chunkIndex >= 0 && chunk.chunkIndex < totalChunks)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
  const usable = saved.filter((chunk) => hasUsableTranscript(chunk.text));
  return {
    transcript: usable.map((chunk) => chunk.text.trim()).join("\n"),
    savedChunks: saved.length,
    totalChunks
  };
}
