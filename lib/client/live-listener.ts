"use client";

// Hands-free listening for the live Ask Meeting conversation: records the
// microphone continuously, notices when the person starts talking, and hands
// over the recording once they have been quiet for a moment - no tap to stop.
//
// Detection is a loudness gate measured against the room's own background
// level, so a steady fan or air-conditioner raises the bar instead of
// counting as speech.

const FRAME_MS = 50;
const START_FRAMES = 3; // ~150ms of voice before it counts as talking
const END_SILENCE_MS = 1100; // quiet this long after talking = question done
const MIN_SPEECH_MS = 400; // shorter bursts (a cough, a click) are ignored
const MAX_QUESTION_MS = 45000;
const IDLE_RESTART_MS = 10000; // keep the waiting recording short

export type LiveListener = {
  listen: () => void;
  pause: () => void;
  sendNow: () => void;
  dispose: () => void;
};

function recorderMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function createLiveListener(
  stream: MediaStream,
  audio: AudioContext,
  handlers: { onHearing: () => void; onQuestion: (recording: Blob) => void }
): LiveListener {
  const source = audio.createMediaStreamSource(stream);
  const analyser = audio.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const mimeType = recorderMimeType();

  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let listening = false;
  let talking = false;
  let loudFrames = 0;
  let speechStartedAt = 0;
  let lastVoiceAt = 0;
  let recorderStartedAt = 0;
  let noiseFloor = 0.01;

  function startRecorder() {
    chunks = [];
    recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start();
    recorderStartedAt = Date.now();
  }

  function discardRecorder() {
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    recorder = null;
    chunks = [];
  }

  function finishQuestion() {
    const current = recorder;
    listening = false;
    talking = false;
    if (!current || current.state === "inactive") return;
    current.onstop = () => {
      const type = current.mimeType || mimeType || "audio/webm";
      handlers.onQuestion(new Blob(chunks, { type }));
    };
    current.stop();
    recorder = null;
  }

  function level() {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    return Math.sqrt(sum / samples.length);
  }

  const timer = setInterval(() => {
    if (!listening) return;
    const now = Date.now();
    const rms = level();
    const threshold = Math.max(0.02, noiseFloor * 2.5);

    if (!talking) {
      if (rms > threshold) {
        loudFrames += 1;
        if (loudFrames >= START_FRAMES) {
          talking = true;
          speechStartedAt = now - loudFrames * FRAME_MS;
          lastVoiceAt = now;
          handlers.onHearing();
        }
      } else {
        loudFrames = 0;
        // Follow the room's background level while nobody is talking.
        noiseFloor = noiseFloor * 0.95 + rms * 0.05;
        if (now - recorderStartedAt > IDLE_RESTART_MS) {
          discardRecorder();
          startRecorder();
        }
      }
      return;
    }

    if (rms > threshold * 0.8) lastVoiceAt = now;
    const quietFor = now - lastVoiceAt;
    if (now - speechStartedAt > MAX_QUESTION_MS) {
      finishQuestion();
    } else if (quietFor > END_SILENCE_MS) {
      if (lastVoiceAt - speechStartedAt >= MIN_SPEECH_MS) finishQuestion();
      else {
        talking = false;
        loudFrames = 0;
      }
    }
  }, FRAME_MS);

  return {
    listen() {
      discardRecorder();
      talking = false;
      loudFrames = 0;
      startRecorder();
      listening = true;
    },
    pause() {
      listening = false;
      talking = false;
      discardRecorder();
    },
    sendNow() {
      if (listening) finishQuestion();
    },
    dispose() {
      clearInterval(timer);
      listening = false;
      discardRecorder();
      source.disconnect();
    }
  };
}
