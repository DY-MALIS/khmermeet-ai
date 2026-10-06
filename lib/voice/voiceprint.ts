import { createHash } from "crypto";
import { readFile, rename, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import * as ort from "onnxruntime-node";
import { fbankFeatures, MEL_BINS, SAMPLE_RATE } from "./fbank";

// A voiceprint is 256 numbers describing how someone sounds, from the
// WeSpeaker ResNet34 speaker model (trained on VoxCeleb; CC BY 4.0,
// https://huggingface.co/onnx-community/wespeaker-voxceleb-resnet34-LM).
// Two voiceprints of the same person point the same way (cosine near 1).
//
// Measured with this code (2026-10-06): 16 Khmer men (OpenSLR 42), 10 of them
// remembered from ~30 s in one room, then different sentences through a
// phone-quality, echoing, noisy "second meeting", over 4 random splits and
// 2 noise levels. With the threshold and margin below: remembered people
// named right 78/80, never a wrong name, 2 left unnamed; people never
// remembered got someone's name 2/48 times - both a look-alike voice that
// phone-quality audio pushed up to 0.76-0.78 (the same pair scores 0.55 on
// clean audio). Raising the threshold to 0.75 did not remove those two and
// left 10/80 remembered people unnamed. Malis's real third call matched him
// at 0.72. A smaller model (wavlm-base-plus-sv) could not separate these
// voices at all, so do not swap the model without re-measuring.

const MODEL_URL =
  "https://huggingface.co/onnx-community/wespeaker-voxceleb-resnet34-LM/resolve/6a61a1833ff2583aabeba044f5c8221f00b67ceb/onnx/model.onnx";
const MODEL_SHA256 = "3955447b0499dc9e0a4541a895df08b03c69098eba4e56c02b5603e9f7f4fcbb";
const MODEL_BYTES = 26535549;

// Below this, the same voice and a different voice overlap too much to name
// anyone safely; a wrong name is worse than "Speaker 2".
export const MATCH_THRESHOLD = 0.7;
// The best match must also beat the second best by this much, so two
// similar-sounding remembered people are never decided by a coin toss.
export const MATCH_MARGIN = 0.12;
// Less speech than this gives an unreliable voiceprint, so it is neither
// remembered nor matched.
export const MIN_SPEECH_SECONDS = 10;
// More than this adds little and costs time (~1 s of compute per 10 s).
export const MAX_SPEECH_SECONDS = 60;

let sessionPromise: Promise<ort.InferenceSession> | null = null;

async function cachedModelPath() {
  const target = path.join(os.tmpdir(), `khmermeet-voice-${MODEL_SHA256.slice(0, 12)}.onnx`);
  const existing = await stat(target).catch(() => null);
  if (existing?.size === MODEL_BYTES) return target;
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`Voice model download failed (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== MODEL_SHA256) throw new Error("Voice model download did not match its checksum.");
  // Write then rename, so a concurrent request never reads half a file.
  const partial = `${target}.${process.pid}.${Date.now()}.part`;
  await writeFile(partial, bytes);
  await rename(partial, target);
  return target;
}

function voiceSession() {
  sessionPromise ??= cachedModelPath()
    .then(async (file) => ort.InferenceSession.create(await readFile(file)))
    .catch((error) => {
      sessionPromise = null;
      throw error;
    });
  return sessionPromise;
}

// Keeps only the 20 ms frames where someone is talking, up to maxSeconds.
// The bar adapts to the recording's level so a quiet microphone still
// counts, but never drops to where room hiss would count as speech.
export function speechOnly(samples: Float32Array, maxSeconds = MAX_SPEECH_SECONDS) {
  const frame = SAMPLE_RATE / 50;
  const levels: number[] = [];
  for (let start = 0; start + frame <= samples.length; start += frame) {
    let energy = 0;
    for (let i = start; i < start + frame; i++) energy += samples[i] * samples[i];
    levels.push(Math.sqrt(energy / frame));
  }
  const sorted = [...levels].sort((a, b) => a - b);
  const loud = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0;
  const bar = Math.min(0.02, Math.max(0.005, loud * 0.25));
  const keep = levels.flatMap((level, index) => (level > bar ? [index] : [])).slice(0, maxSeconds * 50);
  const out = new Float32Array(keep.length * frame);
  keep.forEach((index, position) => out.set(samples.subarray(index * frame, (index + 1) * frame), position * frame));
  return out;
}

export function speechSeconds(speech: Float32Array) {
  return speech.length / SAMPLE_RATE;
}

function normalize(vector: Float32Array) {
  let length = 0;
  for (const value of vector) length += value * value;
  length = Math.sqrt(length) || 1;
  return vector.map((value) => value / length);
}

// speech: 16 kHz mono, already reduced to speech (see speechOnly).
export async function voiceprint(speech: Float32Array) {
  const session = await voiceSession();
  const { data, frames } = fbankFeatures(speech);
  const output = await session.run({ input_features: new ort.Tensor("float32", data, [1, frames, MEL_BINS]) });
  return normalize(Float32Array.from(output.last_hidden_state.data as Float32Array));
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>) {
  let dot = 0;
  let lengthA = 0;
  let lengthB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    lengthA += a[i] * a[i];
    lengthB += b[i] * b[i];
  }
  return dot / Math.sqrt(lengthA * lengthB || 1);
}

// One voiceprint per person from several samples, weighted by how much
// speech each had.
export function combineVoiceprints(samples: Array<{ voiceprint: ArrayLike<number>; seconds: number }>) {
  const combined = new Float32Array(samples[0]?.voiceprint.length ?? 0);
  for (const sample of samples) for (let i = 0; i < combined.length; i++) combined[i] += sample.voiceprint[i] * sample.seconds;
  return normalize(combined);
}

// The remembered person this voice belongs to, or null when no one is a
// clear match (unknown voice, or two remembered people too close to call).
export function matchVoice(voice: ArrayLike<number>, people: Array<{ name: string; voiceprint: ArrayLike<number> }>) {
  const scores = people.map((person) => ({ name: person.name, score: cosine(voice, person.voiceprint) })).sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (!best || best.score < MATCH_THRESHOLD) return null;
  if (second && best.score - second.score < MATCH_MARGIN) return null;
  return best;
}
