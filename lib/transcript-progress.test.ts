import assert from "node:assert/strict";
import test from "node:test";
import { assembleSavedAudioChunks, chooseAudioWindowText, INCOMPLETE_AUDIO_CHUNK_PREFIX, unpackSavedAudioChunkText } from "./transcript-progress";

test("timeout recovery returns saved audio windows in recording order", () => {
  assert.deepEqual(assembleSavedAudioChunks([
    { chunkIndex: 2, totalChunks: 4, text: "Speaker 1: Third part spoken" },
    { chunkIndex: 0, totalChunks: 4, text: "Speaker 1: First part spoken" },
    { chunkIndex: 3, totalChunks: 4, text: "" },
    { chunkIndex: 1, totalChunks: 4, text: "Unknown Speaker: Unknown" }
  ]), {
    transcript: "Speaker 1: First part spoken\nSpeaker 1: Third part spoken",
    savedChunks: 4,
    totalChunks: 4
  });
});

test("incomplete window state survives a retry without leaking into displayed text", () => {
  const stored = `${INCOMPLETE_AUDIO_CHUNK_PREFIX}Speaker 1: Partial words`;
  assert.deepEqual(unpackSavedAudioChunkText(stored), {
    text: "Speaker 1: Partial words",
    incomplete: true
  });
  assert.equal(assembleSavedAudioChunks([{ chunkIndex: 0, totalChunks: 1, text: stored }]).transcript,
    "Speaker 1: Partial words");
});

test("saved partial transcript preserves spoken number words", () => {
  assert.equal(assembleSavedAudioChunks([
    { chunkIndex: 0, totalChunks: 1, text: "Speaker 1: មួយប៊ីលាន" }
  ]).transcript, "Speaker 1: មួយប៊ីលាន");
});

test("complete short listens replace a longer answer that skipped the middle", () => {
  const earlier = "Speaker 1: opening words and a long repeated ending that missed the middle";
  const covered = "Speaker 1: opening words\nSpeaker 2: middle words\nSpeaker 1: ending";
  assert.ok(covered.length < earlier.length);
  assert.equal(chooseAudioWindowText(earlier, covered, true), covered);
  assert.equal(chooseAudioWindowText(earlier, covered, false), earlier);
  assert.equal(chooseAudioWindowText(earlier, "", true), earlier);
});
