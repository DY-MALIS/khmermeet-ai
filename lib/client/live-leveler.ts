// Brings a distant voice up to a normal level before Gemini hears it. A
// person a few metres away reaches the phone 20-30 dB quieter than one
// holding it; the recorder already levels its input the same way (see
// components/recording-panel.tsx), and live mode now does too.
//
// The gain follows the loudness of recent SPEECH only (blocks the turn
// detector counted as speech), with a slowly decaying peak so it settles on
// the speaker's level instead of pumping between words, and is never wound
// up on an empty room. Peaks are softly limited so a near voice or a sudden
// loud sound cannot clip after the gain.

const TARGET_SPEECH_RMS = 0.08;
export const MAX_GAIN = 20;
const PEAK_DECAY = 0.9; // per 100 ms block
const GAIN_SMOOTHING = 0.3; // fraction of the way to the wanted gain per block

export function createLeveler() {
  let peak = 0;
  let gain = 1;
  return {
    gain: () => gain,
    // samples: one block at 16 kHz; rawRms: its loudness before any gain;
    // isSpeech: whether the turn detector counts it as speech.
    process(samples: Float32Array, rawRms: number, isSpeech: boolean) {
      peak *= PEAK_DECAY;
      if (isSpeech) peak = Math.max(peak, rawRms);
      if (peak > 0) {
        const wanted = Math.min(MAX_GAIN, Math.max(1, TARGET_SPEECH_RMS / peak));
        gain += (wanted - gain) * GAIN_SMOOTHING;
      }
      const out = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const value = samples[i] * gain;
        // Soft limit: unchanged below 0.5, then eases towards +-1.
        const size = Math.abs(value);
        out[i] = size <= 0.5 ? value : Math.sign(value) * (0.5 + 0.5 * Math.tanh((size - 0.5) / 0.5));
      }
      return out;
    }
  };
}
