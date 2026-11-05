import { hasUsableTranscript, normalizeTranscriptDigits } from "@/lib/transcript-quality";
import { spellTranscriptNumberWords } from "@/lib/transcript-number-words";

export type SavedAudioChunk = { chunkIndex: number; totalChunks: number; text: string };
export type AudioReviewRange = { startSeconds: number; endSeconds: number };

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
      return { text: chooseAudioWindowText(fallback, assembled, covered, listenedToEverySubwindow(subwindows)), incomplete: !covered, covered, subwindows };
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
export function listenedToEverySubwindow(parts: Array<SavedAudioSubwindow | null>) {
  return parts.length > 0 && parts.every((part) => part !== null && (part.complete || hasUsableTranscript(part.text)));
}

export function chooseAudioWindowText(previous: string, candidate: string, coversEverySubwindow: boolean, listenedEverySubwindow = false) {
  if (!hasUsableTranscript(candidate)) return previous;
  // A newer listen of every short piece can contain a recovered phrase even
  // when it is slightly shorter than the old one-pass response. Keep the old
  // response if the new text is substantially shorter, and keep the window
  // marked incomplete until every short piece passes its quality check.
  if (coversEverySubwindow || candidate.length > previous.length ||
    (listenedEverySubwindow && candidate.length >= previous.length * 0.8)) return candidate;
  return previous;
}

// Two retry clips share a few seconds of audio at their boundary. Remove
// duplicated text only when the same speaker's ending and beginning match
// exactly; an uncertain match stays visible instead of deleting real words.
export function stitchOverlappingAudioTranscripts(first: string, second: string) {
  const left = first.trim();
  const right = second.trim();
  if (!left) return right;
  if (!right) return left;
  const lastLine = left.slice(left.lastIndexOf("\n") + 1);
  const firstLineEnd = right.indexOf("\n");
  const firstLine = firstLineEnd < 0 ? right : right.slice(0, firstLineEnd);
  const labelPattern = /^([^:\n]{1,60}):\s*/;
  const leftLabel = lastLine.match(labelPattern);
  const rightLabel = firstLine.match(labelPattern);
  if (leftLabel?.[1] !== rightLabel?.[1]) return `${left}\n${right}`;
  const leftWords = lastLine.slice(leftLabel?.[0].length ?? 0).trimEnd();
  const rightWords = firstLine.slice(rightLabel?.[0].length ?? 0).trimStart();
  let repeatedChars = 0;
  for (let count = Math.min(160, leftWords.length, rightWords.length); count >= 8; count--) {
    if (leftWords.endsWith(rightWords.slice(0, count))) {
      repeatedChars = count;
      break;
    }
  }
  if (!repeatedChars) return `${left}\n${right}`;
  const uniqueFirstLine = rightWords.slice(repeatedChars).trimStart();
  const rest = firstLineEnd < 0 ? "" : right.slice(firstLineEnd + 1).trim();
  const next = [
    uniqueFirstLine ? `${rightLabel?.[0] ?? ""}${uniqueFirstLine}` : "",
    rest
  ].filter(Boolean).join("\n");
  return next ? `${left}\n${next}` : left;
}

// Show the exact short listens still awaiting review instead of only saying
// that a long transcript is incomplete. Times are approximate if a provider
// size limit forced the source into windows shorter than the preferred size.
export function unfinishedAudioReviewRanges(chunks: SavedAudioChunk[], durationSeconds: number) {
  if (!chunks.length || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return [] as AudioReviewRange[];
  const totalChunks = Math.max(...chunks.map((chunk) => chunk.totalChunks));
  if (totalChunks <= 0) return [] as AudioReviewRange[];
  const preferredWindowSeconds = durationSeconds > 20 * 60 ? 240 : 120;
  const windowSeconds = totalChunks > Math.ceil(durationSeconds / preferredWindowSeconds)
    ? Math.ceil(durationSeconds / totalChunks)
    : preferredWindowSeconds;
  const saved = new Map(chunks.map((chunk) => [chunk.chunkIndex, chunk.text]));
  const ranges: AudioReviewRange[] = [];
  const add = (startSeconds: number, endSeconds: number) => {
    const end = Math.min(durationSeconds, endSeconds);
    if (end <= startSeconds) return;
    const previous = ranges.at(-1);
    if (previous && startSeconds <= previous.endSeconds + 1) {
      previous.endSeconds = Math.max(previous.endSeconds, end);
    } else {
      ranges.push({ startSeconds, endSeconds: end });
    }
  };
  for (let index = 0; index < totalChunks; index++) {
    const text = saved.get(index);
    const start = index * windowSeconds;
    if (text === "") continue; // verified silent window
    if (text === undefined) {
      add(start, start + windowSeconds);
      continue;
    }
    const state = unpackSavedAudioChunkText(text);
    if (state.covered || (!state.incomplete && durationSeconds <= 20 * 60)) continue;
    if (state.subwindows?.length) {
      const subwindowSeconds = windowSeconds / state.subwindows.length;
      state.subwindows.forEach((part, partIndex) => {
        if (!part?.complete) add(start + partIndex * subwindowSeconds, start + (partIndex + 1) * subwindowSeconds);
      });
    } else {
      add(start, start + windowSeconds);
    }
  }
  return ranges;
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
    transcript: spellTranscriptNumberWords(normalizeTranscriptDigits(usable.map((text) => text.trim()).join("\n"))),
    savedChunks: saved.length,
    totalChunks,
    completedSubwindows: saved.reduce((count, chunk) => {
      const state = unpackSavedAudioChunkText(chunk.text);
      if (state.covered) return count + 4;
      return count + (state.subwindows?.filter((part) => part?.complete).length ?? 0);
    }, 0)
  };
}
