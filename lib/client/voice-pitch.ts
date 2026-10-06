// Estimates whether the person asking has a typically male or female voice
// from its pitch, so the live assistant can address them as "លោក" or
// "អ្នកស្រី". Adult speaking pitch is roughly 85-155 Hz for men and 165-255 Hz
// for women; anything in between, or too little clear voice, is "unsure"
// and gets the neutral "អ្នក" - calling a woman "លោក" is worse than not
// guessing. Gemini judging by ear called a lower female voice "លោក" every
// time, which is why this is measured here instead.

const RATE = 16000;
const FRAME = 800; // 50 ms: long enough to hold two periods of a deep voice
const MIN_LAG = Math.floor(RATE / 400);
const MAX_LAG = Math.floor(RATE / 70);
// Measured 2026-10-06 on ~5 s questions from 326 real Khmer speakers with
// labelled gender (Google FLEURS: men's median pitch 115-160 Hz, women's
// 226-293 Hz), 16 real Khmer women (OpenSLR 42) and 16 Gemini voices. With
// these settings no one, on any of that data, was called the wrong gender;
// "unsure" (neutral "អ្នក") was 49% of real men, 15% of real women and 8-37%
// of the Gemini voices. Narrower bands called some lower women "male".
export const MALE_BELOW_HZ = 160;
export const FEMALE_ABOVE_HZ = 185;
// At least this many voiced 50 ms frames (~0.5 s of clear voice) to decide.
const MIN_VOICED_FRAMES = 10;

export type AskerVoice = "male" | "female" | "unsure";

// Sent to the live assistant with each question (see lib/ai/gemini-live.ts).
// An explicit "unsure" matters: with no note at all, Gemini still guessed and
// called a woman "លោក".
export const VOICE_NOTES: Record<AskerVoice, string> = {
  male: "[សំឡេងអ្នកសួរ: បុរស]",
  female: "[សំឡេងអ្នកសួរ: ស្ត្រី]",
  unsure: "[សំឡេងអ្នកសួរ: មិនប្រាកដ]"
};

// Pitch of one frame with YIN (de Cheveigne & Kawahara, 2002), or null when
// the frame is too quiet or not clearly voiced (breath, noise, consonants).
// YIN picks the FIRST period that repeats well, not the best-scoring one:
// plain autocorrelation with an "octave correction" doubled real men's
// pitch (~115 Hz read as ~230 Hz) and called all 16 test men "female".
const YIN_THRESHOLD = 0.25;
export function framePitchHz(frame: Float32Array): number | null {
  let energy = 0;
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
  if (Math.sqrt(energy / frame.length) < 0.01) return null;
  const window = frame.length - MAX_LAG;
  const diff = new Float64Array(MAX_LAG + 1);
  for (let lag = 1; lag <= MAX_LAG; lag++) {
    let sum = 0;
    for (let i = 0; i < window; i++) {
      const delta = frame[i] - frame[i + lag];
      sum += delta * delta;
    }
    diff[lag] = sum;
  }
  // Cumulative mean normalised difference.
  let running = 0;
  const cmnd = new Float64Array(MAX_LAG + 1);
  cmnd[0] = 1;
  for (let lag = 1; lag <= MAX_LAG; lag++) {
    running += diff[lag];
    cmnd[lag] = running ? (diff[lag] * lag) / running : 1;
  }
  let lag = MIN_LAG;
  for (; lag <= MAX_LAG; lag++) {
    if (cmnd[lag] < YIN_THRESHOLD) {
      while (lag + 1 <= MAX_LAG && cmnd[lag + 1] < cmnd[lag]) lag++;
      break;
    }
  }
  if (lag > MAX_LAG) return null;
  // Parabolic interpolation around the dip for sub-sample accuracy.
  const before = cmnd[lag - 1] ?? cmnd[lag];
  const after = cmnd[lag + 1] ?? cmnd[lag];
  const bend = before + after - 2 * cmnd[lag];
  const exact = bend > 0 ? lag + (before - after) / (2 * bend) : lag;
  return RATE / exact;
}

// Collects pitch over one spoken question (16 kHz samples, any chunk size).
export function createPitchTracker() {
  let pending = new Float32Array(0);
  let pitches: number[] = [];
  return {
    reset() {
      pending = new Float32Array(0);
      pitches = [];
    },
    push(samples: Float32Array) {
      const joined = new Float32Array(pending.length + samples.length);
      joined.set(pending);
      joined.set(samples, pending.length);
      let offset = 0;
      for (; offset + FRAME <= joined.length; offset += FRAME) {
        const pitch = framePitchHz(joined.subarray(offset, offset + FRAME));
        if (pitch) pitches.push(pitch);
      }
      pending = joined.slice(offset);
    },
    verdict(): AskerVoice {
      if (pitches.length < MIN_VOICED_FRAMES) return "unsure";
      const sorted = [...pitches].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (median < MALE_BELOW_HZ) return "male";
      if (median > FEMALE_ABOVE_HZ) return "female";
      return "unsure";
    },
    medianHz() {
      if (!pitches.length) return null;
      const sorted = [...pitches].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    }
  };
}
