import assert from "node:assert/strict";
import test from "node:test";
import { assembleSavedAudioChunks } from "./transcript-progress";

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
