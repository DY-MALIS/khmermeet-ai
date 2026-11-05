import { hasUsableTranscript, normalizeTranscriptDigits } from "@/lib/transcript-quality";

type SavedAudioChunk = { chunkIndex: number; totalChunks: number; text: string };

// The chunk table has no completion column. Keep the retry state alongside
// its text without exposing this internal marker in the displayed transcript.
export const INCOMPLETE_AUDIO_CHUNK_PREFIX = "[khmermeet-incomplete-window]\n";
export const COVERED_AUDIO_CHUNK_PREFIX = "[khmermeet-covered-window]\n";
export const PARTIAL_AUDIO_SUBWINDOWS_PREFIX = "[khmermeet-subwindows-v1]\n";

export type SavedAudioSubwindow = { text: string; complete: boolean };
type UnpackedAudioChunk = {
  text: string;
  incomplete: boolean;
  covered: boolean;
  subwindows?: Array<SavedAudioSubwindow | null>;
};

export function packPartialAudioSubwindows(fallback: string, parts: Array<SavedAudioSubwindow | null>) {
  return `${PARTIAL_AUDIO_SUBWINDOWS_PREFIX}${JSON.stringify({ fallback, parts })}`;
}

export function unpackSavedAudioChunkText(value: string): UnpackedAudioChunk {
  if (value.startsWith(PARTIAL_AUDIO_SUBWINDOWS_PREFIX)) {
    try {
      const parsed = JSON.parse(value.slice(PARTIAL_AUDIO_SUBWINDOWS_PREFIX.length)) as {
        fallback?: unknown;
        parts?: unknown;
      };
      const fallback = typeof parsed.fallback === "string" ? parsed.fallback : "";
      const subwindows = Array.isArray(parsed.parts)
        ? parsed.parts.map((part): SavedAudioSubwindow | null => {
            if (typeof part !== "object" || part === null) return null;
            const candidate = part as Record<string, unknown>;
            return typeof candidate.text === "string" && typeof candidate.complete === "boolean"
              ? { text: candidate.text, complete: candidate.complete }
              : null;
          })
        : [];
      const assembled = subwindows.map((part) => part?.text ?? "").filter(Boolean).join("\n");
      const covered = subwindows.length > 0 && subwindows.every((part) => part?.complete) && hasUsableTranscript(assembled);
      return { text: chooseAudioWindowText(fallback, assembled, covered), incomplete: !covered, covered, subwindows };
    } catch {
      return { text: "", incomplete: true, covered: false };
    }
  }
  if (value.startsWith(INCOMPLETE_AUDIO_CHUNK_PREFIX)) {
    return { text: value.slice(INCOMPLETE_AUDIO_CHUNK_PREFIX.length), incomplete: true, covered: false };
  }
  if (value.startsWith(COVERED_AUDIO_CHUNK_PREFIX)) {
    return { text: value.slice(COVERED_AUDIO_CHUNK_PREFIX.length), incomplete: false, covered: true };
  }
  return { text: value, incomplete: false, covered: false };
}

// A complete set of short, ordered listens covers the whole window. A
// longer single-pass answer can still skip speech in the middle, so length
// must not override that coverage. Partial short listens remain provisional.
export function chooseAudioWindowText(previous: string, candidate: string, coversEverySubwindow: boolean) {
  if (!hasUsableTranscript(candidate)) return previous;
  if (coversEverySubwindow || candidate.length > previous.length) return candidate;
  return previous;
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
    totalChunks,
    completedSubwindows: saved.reduce((count, chunk) => {
      const state = unpackSavedAudioChunkText(chunk.text);
      if (state.covered) return count + 4;
      return count + (state.subwindows?.filter((part) => part?.complete).length ?? 0);
    }, 0)
  };
}
