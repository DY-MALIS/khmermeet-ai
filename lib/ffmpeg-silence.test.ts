import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { estimatedAudibleAudioSeconds, isAudioWindowSilent } from "./ffmpeg";

test("silent recording is skipped while audible recording is preserved", async () => {
  assert.ok(ffmpegPath);
  const dir = await mkdtemp(path.join(os.tmpdir(), "khmermeet-silence-test-"));
  try {
    const silent = path.join(dir, "silent.wav");
    const audible = path.join(dir, "audible.wav");
    const quiet = path.join(dir, "quiet.wav");
    const mixed = path.join(dir, "mixed.wav");
    const sparse = path.join(dir, "sparse.wav");
    await promisify(execFile)(ffmpegPath, ["-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "3", silent]);
    await promisify(execFile)(ffmpegPath, ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000", "-t", "3", audible]);
    await promisify(execFile)(ffmpegPath, ["-i", audible, "-filter:a", "volume=0.03", quiet]);
    await promisify(execFile)(ffmpegPath, ["-i", silent, "-i", audible, "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[out]", "-map", "[out]", mixed]);
    await promisify(execFile)(ffmpegPath, [
      "-f", "lavfi", "-t", "120", "-i", "anullsrc=r=16000:cl=mono",
      "-f", "lavfi", "-t", "0.5", "-i", "sine=frequency=440:sample_rate=16000",
      "-f", "lavfi", "-t", "119.5", "-i", "anullsrc=r=16000:cl=mono",
      "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]",
      "-map", "[out]", sparse
    ]);
    assert.equal(await isAudioWindowSilent(silent, 3), true);
    assert.equal(await isAudioWindowSilent(audible, 3), false);
    assert.equal(await isAudioWindowSilent(quiet, 3), false);
    assert.equal(await isAudioWindowSilent(sparse, 240), false);
    const audibleSeconds = await estimatedAudibleAudioSeconds(mixed, 6);
    assert.ok(audibleSeconds !== null && audibleSeconds > 2.5 && audibleSeconds < 3.5);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
