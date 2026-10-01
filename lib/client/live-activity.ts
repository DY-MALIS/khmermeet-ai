// Client-side turn detection for Gemini's manual activity mode.
// Keep a short prefix so detecting speech does not clip the first syllable.
export function createLiveActivity(send: (input: Record<string, unknown>) => void) {
  let active = false;
  let loudMs = 0;
  let quietMs = 0;
  let noiseFloor = 0.01;
  let prefix: Array<{ data: string; duration: number }> = [];

  const audio = (data: string) => send({ audio: { data, mimeType: "audio/pcm;rate=16000" } });
  return {
    reset() {
      if (active) send({ activityEnd: {} });
      active = false;
      loudMs = quietMs = 0;
      prefix = [];
    },
    push(data: string, rms: number, duration: number) {
      const threshold = Math.max(0.02, noiseFloor * 2.5);
      if (!active) {
        prefix.push({ data, duration });
        while (prefix.length > 1 && prefix.slice(1).reduce((sum, item) => sum + item.duration, 0) >= 300) prefix.shift();
        if (rms > threshold) loudMs += duration;
        else {
          loudMs = 0;
          noiseFloor = noiseFloor * 0.95 + rms * 0.05;
        }
        if (loudMs < 150) return;
        send({ activityStart: {} });
        active = true;
        quietMs = 0;
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
