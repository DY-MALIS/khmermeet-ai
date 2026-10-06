// Kaldi-style log-mel filterbank features, the input the WeSpeaker voice
// model expects: 16 kHz mono, 25 ms frames every 10 ms, 80 mel bins,
// mean-normalised over the whole clip. Written to match transformers.js's
// WeSpeakerFeatureExtractor exactly (checked by comparing the voiceprints
// both produce), without pulling that library into the app. No Node or
// browser APIs, so the same code can run on either side.

export const SAMPLE_RATE = 16000;
export const MEL_BINS = 80;
const FRAME = 400; // 25 ms
const HOP = 160; // 10 ms
const FFT_SIZE = 512;
const FREQ_BINS = FFT_SIZE / 2 + 1;
const MIN_FRAMES = 9;
const MEL_FLOOR = 1.192092955078125e-7;

const kaldiMel = (hz: number) => 1127 * Math.log(1 + hz / 700);

// Triangular filters laid out in mel space from 20 Hz to Nyquist.
function melFilters() {
  const low = kaldiMel(20);
  const high = kaldiMel(SAMPLE_RATE / 2);
  const edges = Array.from({ length: MEL_BINS + 2 }, (_, i) => low + ((high - low) * i) / (MEL_BINS + 1));
  const binWidth = SAMPLE_RATE / FFT_SIZE;
  const fftMel = Array.from({ length: FREQ_BINS }, (_, j) => kaldiMel(j * binWidth));
  const filters = Array.from({ length: MEL_BINS }, () => new Float64Array(FREQ_BINS));
  for (let i = 0; i < MEL_BINS; i++) {
    for (let j = 0; j < FREQ_BINS; j++) {
      const down = (fftMel[j] - edges[i]) / (edges[i + 1] - edges[i]);
      const up = (edges[i + 2] - fftMel[j]) / (edges[i + 2] - edges[i + 1]);
      filters[i][j] = Math.max(0, Math.min(down, up));
    }
  }
  return filters;
}

// Symmetric (non-periodic) Hamming window.
const HAMMING = Float64Array.from({ length: FRAME }, (_, n) => 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (FRAME - 1)));
let filtersCache: Float64Array[] | null = null;

// In-place iterative radix-2 FFT.
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

// samples: 16 kHz mono in [-1, 1]. Returns frames x 80 values, row-major.
export function fbankFeatures(samples: Float32Array) {
  const filters = (filtersCache ??= melFilters());
  const frames = Math.max(MIN_FRAMES, Math.floor((samples.length - FRAME) / HOP) + 1);
  const out = new Float32Array(frames * MEL_BINS);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const power = new Float64Array(FREQ_BINS);
  for (let f = 0; f < frames; f++) {
    re.fill(0);
    im.fill(0);
    const offset = f * HOP;
    const size = Math.max(0, Math.min(FRAME, samples.length - offset));
    let sum = 0;
    // Kaldi works on 16-bit integer scale.
    for (let j = 0; j < size; j++) sum += (re[j] = samples[offset + j] * 32768);
    const mean = size ? sum / size : 0;
    for (let j = 0; j < size; j++) re[j] -= mean;
    for (let j = size - 1; j >= 1; j--) re[j] -= 0.97 * re[j - 1];
    re[0] *= 1 - 0.97;
    for (let j = 0; j < FRAME; j++) re[j] *= HAMMING[j];
    fft(re, im);
    for (let j = 0; j < FREQ_BINS; j++) power[j] = re[j] * re[j] + im[j] * im[j];
    for (let m = 0; m < MEL_BINS; m++) {
      const filter = filters[m];
      let energy = 0;
      for (let j = 0; j < FREQ_BINS; j++) energy += filter[j] * power[j];
      out[f * MEL_BINS + m] = Math.log(Math.max(MEL_FLOOR, energy));
    }
  }
  // Remove the clip's average from every frame (cepstral mean normalisation).
  for (let m = 0; m < MEL_BINS; m++) {
    let total = 0;
    for (let f = 0; f < frames; f++) total += out[f * MEL_BINS + m];
    const mean = total / frames;
    for (let f = 0; f < frames; f++) out[f * MEL_BINS + m] -= mean;
  }
  return { data: out, frames };
}
