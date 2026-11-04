import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { isAudioWindowSilent } from "./ffmpeg";

test("silent recording is skipped while audible recording is preserved", async () => {
  assert.ok(ffmpegPath);
  const dir = await mkdtemp(path.join(os.tmpdir(), "khmermeet-silence-test-"));
  try {
    const silent = path.join(dir, "silent.wav");
    const audible = path.join(dir, "audible.wav");
    await promisify(execFile)(ffmpegPath, ["-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "3", silent]);
    await promisify(execFile)(ffmpegPath, ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000", "-t", "3", audible]);
    assert.equal(await isAudioWindowSilent(silent, 3), true);
    assert.equal(await isAudioWindowSilent(audible, 3), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
