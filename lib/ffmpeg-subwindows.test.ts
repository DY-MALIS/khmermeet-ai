import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { splitAudioIntoChunks } from "./ffmpeg";

test("an underfilled four-minute audio window can be retried in ordered one-minute parts", async () => {
  assert.ok(ffmpegPath);
  const dir = await mkdtemp(path.join(os.tmpdir(), "khmermeet-subwindow-test-"));
  try {
    const source = path.join(dir, "source.wav");
    await promisify(execFile)(ffmpegPath, [
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000", "-t", "240", source
    ]);
    const split = await splitAudioIntoChunks(await readFile(source), "wav", 24 * 1024 * 1024, 60);
    try {
      assert.equal(split.chunks.length, 4);
      const duration = split.chunks.reduce((sum, chunk) => sum + (chunk.durationSeconds ?? 0), 0);
      assert.ok(Math.abs(duration - 240) < 1);
    } finally {
      await split.dispose();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("browser-style WebM audio keeps its full timeline across short windows", async () => {
  assert.ok(ffmpegPath);
  const dir = await mkdtemp(path.join(os.tmpdir(), "khmermeet-webm-subwindow-test-"));
  try {
    const source = path.join(dir, "source.webm");
    await promisify(execFile)(ffmpegPath, [
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000", "-t", "240",
      "-c:a", "libopus", "-b:a", "24k", source
    ]);
    const split = await splitAudioIntoChunks(await readFile(source), "webm", 24 * 1024 * 1024, 60);
    try {
      assert.ok(split.chunks.length >= 4);
      const duration = split.chunks.reduce((sum, chunk) => sum + (chunk.durationSeconds ?? 0), 0);
      assert.ok(Math.abs(duration - 240) < 2, `split duration ${duration}`);
    } finally {
      await split.dispose();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
