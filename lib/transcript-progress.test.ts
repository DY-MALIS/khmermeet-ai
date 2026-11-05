import assert from "node:assert/strict";
import test from "node:test";
import { assembleSavedAudioChunks, chooseAudioWindowText, COVERED_AUDIO_CHUNK_PREFIX, INCOMPLETE_AUDIO_CHUNK_PREFIX, packPartialAudioSubwindows, stitchOverlappingAudioTranscripts, unfinishedAudioReviewRanges, unpackSavedAudioChunkText } from "./transcript-progress";

test("timeout recovery returns saved audio windows in recording order", () => {
  assert.deepEqual(assembleSavedAudioChunks([
    { chunkIndex: 2, totalChunks: 4, text: "Speaker 1: Third part spoken" },
    { chunkIndex: 0, totalChunks: 4, text: "Speaker 1: First part spoken" },
    { chunkIndex: 3, totalChunks: 4, text: "" },
    { chunkIndex: 1, totalChunks: 4, text: "Unknown Speaker: Unknown" }
  ]), {
    transcript: "Speaker 1: First part spoken\nSpeaker 1: Third part spoken",
    savedChunks: 4,
    totalChunks: 4,
    completedSubwindows: 0
  });
});

test("incomplete window state survives a retry without leaking into displayed text", () => {
  const stored = `${INCOMPLETE_AUDIO_CHUNK_PREFIX}Speaker 1: Partial words`;
  assert.deepEqual(unpackSavedAudioChunkText(stored), {
    text: "Speaker 1: Partial words",
    incomplete: true,
    covered: false
  });
  assert.equal(assembleSavedAudioChunks([{ chunkIndex: 0, totalChunks: 1, text: stored }]).transcript,
    "Speaker 1: Partial words");
});

test("only verified short-window coverage is marked complete in saved text", () => {
  const words = "Speaker 1: ten billion and sixty six";
  assert.deepEqual(unpackSavedAudioChunkText(`${COVERED_AUDIO_CHUNK_PREFIX}${words}`), {
    text: words,
    incomplete: false,
    covered: true
  });
  assert.deepEqual(unpackSavedAudioChunkText(words), {
    text: words,
    incomplete: false,
    covered: false
  });
  assert.equal(assembleSavedAudioChunks([{ chunkIndex: 0, totalChunks: 1, text: `${COVERED_AUDIO_CHUNK_PREFIX}${words}` }]).transcript, words);
  assert.equal(assembleSavedAudioChunks([{ chunkIndex: 0, totalChunks: 1, text: `${COVERED_AUDIO_CHUNK_PREFIX}${words}` }]).completedSubwindows, 4);
});

test("saved partial transcript preserves spoken number words", () => {
  assert.equal(assembleSavedAudioChunks([
    { chunkIndex: 0, totalChunks: 1, text: "Speaker 1: មួយប៊ីលាន" }
  ]).transcript, "Speaker 1: មួយប៊ីលាន");
  assert.equal(assembleSavedAudioChunks([
    { chunkIndex: 0, totalChunks: 1, text: "Speaker 1: តម្លៃ 1000000000 ដុល្លារ" }
  ]).transcript, "Speaker 1: តម្លៃ មួយប៊ីលាន ដុល្លារ");
});

test("complete short listens replace a longer answer that skipped the middle", () => {
  const earlier = "Speaker 1: opening words and a long repeated ending that missed the middle";
  const covered = "Speaker 1: opening words\nSpeaker 2: middle words\nSpeaker 1: ending";
  assert.ok(covered.length < earlier.length);
  assert.equal(chooseAudioWindowText(earlier, covered, true), covered);
  assert.equal(chooseAudioWindowText(earlier, covered, false), earlier);
  assert.equal(chooseAudioWindowText(earlier, "", true), earlier);
});

test("partial short listens survive a request boundary without losing their order", () => {
  const fallback = "Speaker 1: An older long answer covering the start and end only";
  const first = { text: "Speaker 1: Opening words", complete: true };
  const last = { text: "Speaker 2: Closing words", complete: false };
  const pending = packPartialAudioSubwindows(fallback, [first, null, last]);
  assert.deepEqual(unpackSavedAudioChunkText(pending), {
    text: fallback,
    incomplete: true,
    covered: false,
    subwindows: [first, null, last]
  });
  assert.equal(assembleSavedAudioChunks([{ chunkIndex: 0, totalChunks: 1, text: pending }]).completedSubwindows, 1);
  const middle = { text: "Speaker 2: Missing middle words", complete: true };
  const covered = unpackSavedAudioChunkText(packPartialAudioSubwindows(fallback, [first, middle, { ...last, complete: true }]));
  assert.equal(covered.text, [first.text, middle.text, last.text].join("\n"));
  assert.equal(covered.covered, true);
});

test("overlapping retry audio keeps new Khmer speech without repeating an exact boundary", () => {
  const first = "Speaker 1: យើងត្រូវតាមដានរហូតអគ្គគាត់ក្ដៅណាស់";
  const second = "Speaker 1: អគ្គគាត់ក្ដៅណាស់ណា។ ដាក់ហើយអត់មក";
  const joined = stitchOverlappingAudioTranscripts(first, second);
  assert.equal(joined, `${first}\nSpeaker 1: ណា។ ដាក់ហើយអត់មក`);
  assert.equal(stitchOverlappingAudioTranscripts(first, "Speaker 2: អគ្គគាត់ក្ដៅណាស់ណា។"),
    `${first}\nSpeaker 2: អគ្គគាត់ក្ដៅណាស់ណា។`);
});

test("review times identify unfinished minutes while excluding the silent tail", () => {
  const chunks = Array.from({ length: 41 }, (_, chunkIndex) => ({ chunkIndex, totalChunks: 41, text: "" }));
  const complete = { text: "Speaker 1: words", complete: true };
  const incomplete = { text: "Speaker 1: partial words", complete: false };
  chunks[0].text = packPartialAudioSubwindows("", [incomplete, complete, complete, complete]);
  chunks[1].text = packPartialAudioSubwindows("", [complete, incomplete, incomplete, complete]);
  chunks[6].text = packPartialAudioSubwindows("", [complete, incomplete, complete, complete]);
  assert.deepEqual(unfinishedAudioReviewRanges(chunks, 9818), [
    { startSeconds: 0, endSeconds: 60 },
    { startSeconds: 300, endSeconds: 420 },
    { startSeconds: 1500, endSeconds: 1560 }
  ]);
});
