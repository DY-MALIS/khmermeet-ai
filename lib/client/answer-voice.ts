"use client";

// Plays Ask Meeting answers through Web Audio instead of an <audio> element.
// iPhone refuses to start audio that begins after an await (the answer
// arrives seconds after the tap), and an <audio> element unlocked by one tap
// was not reliably reusable. An AudioContext resumed inside a tap stays
// unlocked for the rest of the page, which is what a hands-free live
// conversation needs: one tap to start, then every answer plays by itself.

let context: AudioContext | null = null;

function audioContextClass(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

// Must be called synchronously inside a tap/click handler.
export function unlockAnswerAudio() {
  const AudioContextClass = audioContextClass();
  if (!AudioContextClass) return null;
  if (!context || context.state === "closed") context = new AudioContextClass();
  // iPhone silences Web Audio with the ringer switch unless the page says
  // it plays and records like a call (Safari 16.4+; ignored elsewhere).
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) {
    try {
      session.type = "play-and-record";
    } catch {
      // Older WebKit - nothing to set.
    }
  }
  void context.resume().catch(() => undefined);
  // Older iOS only unlocks after something has actually played in the tap.
  const silence = context.createBufferSource();
  silence.buffer = context.createBuffer(1, 1, 22050);
  silence.connect(context.destination);
  silence.start(0);
  return context;
}

export function answerAudioContext() {
  return context;
}

export type VoicePlayback = {
  // "finished" when everything played (or was stopped), "failed" when the
  // server could not voice some of the answer.
  done: Promise<"finished" | "failed">;
  stop: () => void;
};

// Reads the /speak stream - frames of [4-byte length][WAV], one per
// sentence - and schedules each sentence right after the previous one, so
// the first sentence plays while the rest are still arriving.
export function playVoiceStream(response: Response): VoicePlayback {
  const audio = context;
  const sources: AudioBufferSourceNode[] = [];
  let stopped = false;
  const reader = response.body?.getReader();

  const stop = () => {
    stopped = true;
    void reader?.cancel().catch(() => undefined);
    sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Already finished.
      }
    });
  };

  const done = (async (): Promise<"finished" | "failed"> => {
    if (!audio || !reader) return "failed";
    if (audio.state !== "running") await audio.resume().catch(() => undefined);
    let buffered = new Uint8Array(0);
    let nextStart = 0;
    let lastEnded: Promise<void> | null = null;
    let failed = false;

    reading: for (;;) {
      const { done: finished, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (stopped) break;
      if (value) {
        const joined = new Uint8Array(buffered.length + value.length);
        joined.set(buffered);
        joined.set(value, buffered.length);
        buffered = joined;
      }
      while (buffered.length >= 4) {
        const length = new DataView(buffered.buffer, buffered.byteOffset, 4).getUint32(0);
        if (length === 0) {
          failed = true;
          break reading;
        }
        if (buffered.length < 4 + length) break;
        const wav = buffered.slice(4, 4 + length);
        buffered = buffered.slice(4 + length);
        const decoded = await audio.decodeAudioData(wav.buffer).catch(() => null);
        if (stopped) break reading;
        if (!decoded) {
          failed = true;
          break reading;
        }
        const source = audio.createBufferSource();
        source.buffer = decoded;
        source.connect(audio.destination);
        const startAt = Math.max(audio.currentTime + 0.05, nextStart);
        source.start(startAt);
        nextStart = startAt + decoded.duration;
        sources.push(source);
        lastEnded = new Promise<void>((resolve) => {
          source.onended = () => resolve();
        });
      }
      if (finished) break;
    }

    if (lastEnded) await lastEnded;
    if (stopped) return "finished";
    return failed || !sources.length ? "failed" : "finished";
  })();

  return { done, stop };
}
