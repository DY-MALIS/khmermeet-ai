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

// A person answering says "ចាស៎..." / "បាទ..." the moment the question ends,
// then thinks. The live answer needs ~5s before its first word, which the
// owner experienced as the app hanging; playing a short acknowledgement
// straight away (prepared once when the conversation starts) fills that gap
// the way a person would.
const fillers = new Map<string, AudioBuffer>();
let fillerSource: AudioBufferSourceNode | null = null;

async function readFirstVoiceFrame(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 4) return null;
  const length = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
  return length && bytes.length >= 4 + length ? bytes.slice(4, 4 + length) : null;
}

export async function prepareFiller(meetingId: string, gender: "female" | "male") {
  if (fillers.has(gender) || !context) return;
  try {
    const response = await fetch(`/api/meetings/${meetingId}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: gender === "male" ? "បាទ..." : "ចាស៎...", voice: gender })
    });
    if (!response.ok) return;
    const wav = await readFirstVoiceFrame(response);
    if (!wav) return;
    fillers.set(gender, await context.decodeAudioData(wav.buffer));
  } catch {
    // No acknowledgement sound - the answer still plays.
  }
}

// Plays the acknowledgement and returns when (in AudioContext time) it ends,
// so the answer can be scheduled after it; 0 when nothing was played.
export function playFiller(gender: "female" | "male") {
  const buffer = fillers.get(gender);
  if (!context || !buffer) return 0;
  if (context.state !== "running") void context.resume().catch(() => undefined);
  stopFiller();
  fillerSource = context.createBufferSource();
  fillerSource.buffer = buffer;
  fillerSource.connect(context.destination);
  const startAt = context.currentTime + 0.02;
  fillerSource.start(startAt);
  return startAt + buffer.duration;
}

export function stopFiller() {
  try {
    fillerSource?.stop();
  } catch {
    // Already finished.
  }
  fillerSource = null;
}

export type LiveAnswerHandlers = {
  onQuestion: (question: string) => void;
  onFirstSound: () => void;
  onAnswer: (question: string, answer: string) => void;
  onError: (message: string) => void;
};

// Reads the /live-answer stream: [1-byte type][4-byte length][payload]
// frames carrying the heard question, one WAV per sentence, and finally the
// whole answer text. Sentences are scheduled back to back as they arrive.
export function playLiveAnswer(response: Response, handlers: LiveAnswerHandlers, startAfter = 0) {
  const audio = context;
  const sources: AudioBufferSourceNode[] = [];
  let stopped = false;
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

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

  const done = (async (): Promise<"finished" | "failed" | "no-speech"> => {
    if (!audio || !reader) return "failed";
    if (audio.state !== "running") await audio.resume().catch(() => undefined);
    let buffered = new Uint8Array(0);
    let nextStart = startAfter;
    let lastEnded: Promise<void> | null = null;
    let outcome: "finished" | "failed" | "no-speech" = "finished";

    reading: for (;;) {
      const { done: finished, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (stopped) break;
      if (value) {
        const joined = new Uint8Array(buffered.length + value.length);
        joined.set(buffered);
        joined.set(value, buffered.length);
        buffered = joined;
      }
      while (buffered.length >= 5) {
        const type = buffered[0];
        const length = new DataView(buffered.buffer, buffered.byteOffset + 1, 4).getUint32(0);
        if (buffered.length < 5 + length) break;
        const payload = buffered.slice(5, 5 + length);
        buffered = buffered.slice(5 + length);
        if (type === 2) handlers.onQuestion(decoder.decode(payload));
        else if (type === 3) {
          try {
            const { question, answer } = JSON.parse(decoder.decode(payload)) as { question: string; answer: string };
            handlers.onAnswer(question, answer);
          } catch {
            // Text is only for the record; the voice already played.
          }
        } else if (type === 4) {
          handlers.onError(decoder.decode(payload));
          outcome = "failed";
        } else if (type === 5) {
          outcome = "no-speech";
          break reading;
        } else if (type === 1) {
          const decoded = await audio.decodeAudioData(payload.buffer).catch(() => null);
          if (stopped) break reading;
          if (!decoded) continue;
          const source = audio.createBufferSource();
          source.buffer = decoded;
          source.connect(audio.destination);
          const startAt = Math.max(audio.currentTime + 0.05, nextStart);
          source.start(startAt);
          if (!sources.length) handlers.onFirstSound();
          nextStart = startAt + decoded.duration;
          sources.push(source);
          lastEnded = new Promise<void>((resolve) => {
            source.onended = () => resolve();
          });
        }
      }
      if (finished) break;
    }

    if (lastEnded) await lastEnded;
    if (stopped) return "finished";
    if (outcome === "finished" && !sources.length) return "failed";
    return outcome;
  })();

  return { done, stop };
}
