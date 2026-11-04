import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIO_PART_BYTES,
  MAX_AUDIO_RESPONSE_BYTES,
  audioPartCount,
  audioPartPath,
  audioPartSize,
  audioResponseRange,
  parseChunkedAudioManifest
} from "./chunked-audio";

const path = "audio/2026-11-04/123e4567-e89b-42d3-a456-426614174000/manifest.chunks.json";

test("a 149.8 MiB recording fits in eight Free-plan objects and keeps its exact byte count", () => {
  const size = Math.round(149.8 * 1024 * 1024);
  const count = audioPartCount(size);
  assert.equal(count, 8);
  assert.equal([...Array(count)].reduce((sum, _, index) => sum + audioPartSize(size, index), 0), size);
  assert.equal(audioPartPath(path, 7), "audio/2026-11-04/123e4567-e89b-42d3-a456-426614174000/part-07");
  assert.ok(audioPartSize(size, 7) < AUDIO_PART_BYTES);
});

test("playback ranges stay below Vercel's response limit even across Storage parts", () => {
  const size = AUDIO_PART_BYTES * 2 + 100;
  assert.deepEqual(audioResponseRange(`bytes=${AUDIO_PART_BYTES - 2}-${AUDIO_PART_BYTES + 2}`, size), {
    start: AUDIO_PART_BYTES - 2,
    end: AUDIO_PART_BYTES + 2
  });
  assert.deepEqual(audioResponseRange("bytes=0-", size), { start: 0, end: MAX_AUDIO_RESPONSE_BYTES - 1 });
  assert.equal(audioResponseRange("bytes=0-1,3-4", size), null);
  assert.equal(audioResponseRange(`bytes=${size}-`, size), null);
});

test("a manifest cannot point playback at an arbitrary Storage path", () => {
  const manifest = { kind: "khmermeet-chunked-audio", version: 1, size: 25, mimeType: "audio/mpeg" };
  assert.deepEqual(parseChunkedAudioManifest(manifest, path), manifest);
  assert.throws(() => parseChunkedAudioManifest(manifest, "audio/other/manifest.chunks.json"));
  assert.throws(() => parseChunkedAudioManifest({ ...manifest, mimeType: "text/html" }, path));
});
