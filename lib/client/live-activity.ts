// Client-side turn detection for Gemini's manual activity mode.
// Keep a short prefix so detecting speech does not clip the first syllable.
//
// Speech is judged against the room's own noise, not a fixed loudness: a
// person a few metres from the phone arrives 20-30 dB quieter (RMS ~0.003-
// 0.015 over a ~0.001 room), and the old fixed bar of 0.02 never heard them
// at all - not one question started. The noise level is the quiet end of the
// last few seconds (the gaps between words count too), so it follows a room
// getting louder or quieter in either direction.

// Speech must be this many times the room noise...
export const SPEECH_OVER_NOISE = 3;
// ...and never below this, so a silent room's tiny noise does not make every
// breath a question.
export const MIN_SPEECH_RMS = 0.002;
const NOISE_HISTORY_MS = 5000;
const NOISE_PERCENTILE = 0.2;

export function createLiveActivity(send: (input: Record<string, unknown>) => void) {
  let active = false;
  let loudMs = 0;
  // Whether the current loud stretch has had a voice in it yet.
  let heardVoice = false;
  let quietMs = 0;
  let prefix: Array<{ data: string; duration: number }> = [];
  let history: Array<{ rms: number; duration: number }> = [];

  const audio = (data: string) => send({ audio: { data, mimeType: "audio/pcm;rate=16000" } });
  const noiseLevel = () => {
    if (!history.length) return 0;
    const sorted = history.map((item) => item.rms).sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * NOISE_PERCENTILE)];
  };
  return {
    reset() {
      if (active) send({ activityEnd: {} });
      active = false;
      loudMs = quietMs = 0;
      heardVoice = false;
      prefix = [];
    },
    // The bar a block's loudness has to clear to count as speech right now.
    threshold() {
      return Math.max(MIN_SPEECH_RMS, noiseLevel() * SPEECH_OVER_NOISE);
    },
    // rms: the block's loudness BEFORE any gain the page applies, so a gain
    // that changes over time cannot move the noise estimate. voiced: whether
    // the block has a voice-like pitch (isVoicedBlock) - loud noise without
    // one never starts a question.
    push(data: string, rms: number, duration: number, voiced: boolean) {
      const threshold = this.threshold();
      // While someone is talking only the gaps count as room noise - a long,
      // unbroken question would otherwise raise the bar to its own level and
      // cut itself off.
      if (!active || rms <= threshold) history.push({ rms, duration });
      let kept = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        kept += history[i].duration;
        if (kept > NOISE_HISTORY_MS) {
          history = history.slice(i + 1);
          break;
        }
      }
      if (!active) {
        prefix.push({ data, duration });
        while (prefix.length > 1 && prefix.slice(1).reduce((sum, item) => sum + item.duration, 0) >= 300) prefix.shift();
        if (rms > threshold) {
          loudMs += duration;
          heardVoice ||= voiced;
        } else {
          loudMs = 0;
          heardVoice = false;
        }
        if (loudMs < 150 || !heardVoice) return;
        send({ activityStart: {} });
        active = true;
        quietMs = 0;
        heardVoice = false;
        for (const chunk of prefix) audio(chunk.data);
        prefix = [];
        return;
      }
      audio(data);
      quietMs = rms > threshold * 0.8 ? 0 : quietMs + duration;
      if (quietMs >= 1100) {
        send({ activityEnd: {} });
        active = false;
        loudMs = quietMs = 0;
      }
    }
  };
}
