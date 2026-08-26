import { execFile } from "child_process";
import { promisify } from "util";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import path from "path";
import os from "os";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);
let ensuredExecutable = false;

// Confirmed live: Vercel's build/packaging pipeline doesn't reliably
// preserve the executable bit ffmpeg-static's binary has in node_modules -
// without this, execFile fails immediately (ENOENT/EACCES) on first use in
// the deployed function, even though the exact same code works locally.
// Harmless no-op on platforms where it's already executable.
async function ensureFfmpegExecutable() {
  if (ensuredExecutable || !ffmpegPath) return;
  await chmod(ffmpegPath, 0o755).catch(() => undefined);
  ensuredExecutable = true;
}

async function probeDurationSeconds(inputPath: string): Promise<number | null> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not found.");
  await ensureFfmpegExecutable();
  try {
    // ffmpeg -i with no output always exits non-zero (it refuses to run
    // with nothing to encode to) - this is the standard trick to probe
    // duration without bundling ffprobe as a second binary.
    await execFileAsync(ffmpegPath, ["-i", inputPath]);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      const [, h, m, s] = match;
      return Number(h) * 3600 + Number(m) * 60 + Number(s);
    }
    // Chrome MediaRecorder WebM files commonly contain a valid Opus stream
    // but no duration in the container header. FFmpeg reports `Duration: N/A`
    // even though it can decode/re-encode the recording normally.
    if (/Duration:\s*N\/A/i.test(stderr) && /Stream #\d+:\d+.*Audio:/i.test(stderr)) {
      return null;
    }
    // Surface the real cause (binary missing/not executable, bad input,
    // etc.) instead of masking every failure behind the same generic
    // message - confirmed live this distinction matters (a fast ENOENT
    // looks identical to a slow parse miss otherwise).
    throw new Error("FFmpeg could not read the recorded audio stream.");
  }
  throw new Error("Could not determine audio duration (no Duration line in ffmpeg output).");
}

// Splits a large audio buffer into a series of smaller, independently
// decodable audio files using ffmpeg's segment muxer with stream copy (no
// re-encoding - fast even for hours of audio, just remuxes existing
// packets into new container boundaries). Needed because this app now
// records and stores one truly continuous file per participant for the
// whole call (per explicit user request - no restarts, no gaps), but
// OpenRouter's multimodal transcription endpoint caps a single request at
// ~24MB (roughly 25-30 minutes at this app's recording bitrate). Splitting
// only happens here, server-side, after the full recording is already
// safely saved - it never affects what gets recorded or played back.
export async function splitAudioIntoChunks(
  buffer: Buffer,
  ext: string,
  maxBytesPerChunk: number,
  preferredSegmentSeconds?: number
): Promise<Buffer[]> {
  if (buffer.length <= maxBytesPerChunk && !preferredSegmentSeconds) return [buffer];
  if (!ffmpegPath) {
    if (buffer.length <= maxBytesPerChunk) return [buffer];
    throw new Error("ffmpeg binary not found. Long recordings need ffmpeg available in the deployment before they can be split for transcription.");
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "khmermeet-split-"));
  const inputPath = path.join(tmpDir, `input.${ext}`);
  const outputPattern = path.join(tmpDir, `part-%03d.${ext}`);

  try {
    await writeFile(inputPath, buffer);
    await ensureFfmpegExecutable();

    let durationSeconds: number | null;
    try {
      durationSeconds = await probeDurationSeconds(inputPath);
    } catch (error) {
      if (buffer.length <= maxBytesPerChunk) return [buffer];
      throw error;
    }
    if (buffer.length <= maxBytesPerChunk && (!preferredSegmentSeconds || durationSeconds === null || durationSeconds <= preferredSegmentSeconds)) {
      return [buffer];
    }

    const bytesPerSecond = durationSeconds ? buffer.length / Math.max(1, durationSeconds) : 4000;
    // 0.8x safety margin below the ideal ceiling - real bitrate isn't
    // perfectly constant, and landing a segment right at the limit risks
    // tipping over it.
    const sizeBasedSegmentSeconds = Math.max(30, Math.floor((maxBytesPerChunk * 0.8) / bytesPerSecond));
    const segmentSeconds = preferredSegmentSeconds
      ? Math.min(sizeBasedSegmentSeconds, preferredSegmentSeconds)
      : sizeBasedSegmentSeconds;

    await execFileAsync(ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-c", "copy",
      "-map", "0:a",
      "-f", "segment",
      "-segment_time", String(segmentSeconds),
      "-reset_timestamps", "1",
      outputPattern
    ]);

    const files = (await readdir(tmpDir)).filter((name) => name.startsWith("part-")).sort();
    const chunks = (await Promise.all(files.map((name) => readFile(path.join(tmpDir, name)))))
      .filter((chunk) => chunk.length > 1000);
    if (!chunks.length) throw new Error("ffmpeg produced no usable output segments.");
    return chunks;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// Re-encodes one complete recording to a speech-optimized mono M4A without
// cutting or removing any time range. This keeps sentence and speaker-turn
// context intact while fitting providers that cap a single audio request by
// file size.
export async function compressWholeAudioForTranscription(
  buffer: Buffer,
  ext: string,
  maxBytes: number
): Promise<Buffer> {
  if (!ffmpegPath) {
    if (buffer.length <= maxBytes) return buffer;
    throw new Error("ffmpeg binary not found. The recording is too large to prepare for transcription.");
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "khmermeet-compress-"));
  const inputPath = path.join(tmpDir, `input.${ext}`);
  const outputPath = path.join(tmpDir, "complete-recording.m4a");

  try {
    await writeFile(inputPath, buffer);
    await ensureFfmpegExecutable();
    const durationSeconds = await probeDurationSeconds(inputPath);
    // Stay below the provider ceiling after container overhead. 48 kbps is
    // clear for speech; very long meetings can go as low as 16 kbps while
    // retaining the complete timeline in one file.
    // Duration may be absent from Chrome's WebM header. In that case use a
    // conservative speech bitrate; FFmpeg can still decode the full stream.
    const sizeBasedBitrate = durationSeconds
      ? Math.floor((maxBytes * 8 * 0.85) / Math.max(1, durationSeconds))
      : 24000;
    const bitrate = Math.max(16000, Math.min(48000, sizeBasedBitrate));

    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-i", inputPath,
        "-vn",
        "-map", "0:a:0",
        "-ac", "1",
        "-ar", "16000",
        "-af", "highpass=f=80,lowpass=f=7800,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11",
        "-c:a", "aac",
        "-b:a", String(bitrate),
        "-movflags", "+faststart",
        outputPath
      ],
      { timeout: 120000, maxBuffer: 2 * 1024 * 1024 }
    );

    const compressed = await readFile(outputPath);
    if (compressed.length < 1000) throw new Error("ffmpeg produced an empty compressed recording.");
    if (compressed.length > maxBytes) {
      throw new Error("This recording is too long to transcribe as one complete file within the provider's audio limit.");
    }
    return compressed;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

