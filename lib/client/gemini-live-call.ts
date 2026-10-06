"use client";

import { createLiveActivity } from "./live-activity";
import { createPitchTracker, VOICE_NOTES } from "./voice-pitch";

// A realtime voice call with Gemini Live: the microphone streams to Google
// during each question and Gemini's spoken reply streams back. The client
// ends a question after 1.1 seconds of silence; tapping stops playback.
// See lib/ai/gemini-live.ts for why this replaced the
// request-per-question conversation.

const INPUT_RATE = 16000; // what Gemini Live expects from the microphone
const OUTPUT_RATE = 24000; // what it sends back
const SEND_EVERY_MS = 100;
// After the AI stops, keep the microphone closed this much longer so the
// tail of its own voice (and the room's echo of it) is not sent back.
const ECHO_TAIL_S = 0.35;
// Extra delay before the first chunk of a reply, so chunks that arrive a
// little late on a phone connection still play back to back without gaps.
const JITTER_BUFFER_S = 0.15;

// Collects raw microphone samples off the audio thread.
const RECORDER_WORKLET = `
class PcmRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("khmermeet-pcm-recorder", PcmRecorder);
`;

export type LiveCallState = "connecting" | "listening" | "speaking";

export type LiveCallHandlers = {
  onState: (state: LiveCallState) => void;
  onTurn: (question: string, answer: string) => void;
  onError: (message: string) => void;
  // Live cannot carry on (daily free quota used up, or it failed and could
  // not reconnect): the caller continues the conversation the slower way.
  onUnavailable: () => void;
};

export type LiveCall = { end: () => void; stopTalking: () => void };

type LiveSession = { token: string; wsUrl: string; setup: unknown };

// When Google says the free quota is used up (close 1011 "...quota..."), it
// stays used up for hours, so skip Live for a while instead of making every
// new conversation wait a second for the same refusal.
const QUOTA_PAUSE_MS = 15 * 60 * 1000;
let liveQuotaPausedUntil = 0;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// Averages groups of samples down to 16 kHz and packs them as 16-bit PCM.
function downsampleToPcm16(samples: Float32Array, fromRate: number) {
  const ratio = fromRate / INPUT_RATE;
  const length = Math.floor(samples.length / ratio);
  const out = new Int16Array(length);
  for (let index = 0; index < length; index++) {
    const start = Math.floor(index * ratio);
    const end = Math.min(samples.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let cursor = start; cursor < end; cursor++) sum += samples[cursor];
    const value = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  return new Uint8Array(out.buffer);
}

export async function startGeminiLiveCall(options: {
  meetingId: string;
  voice: "female" | "male";
  audio: AudioContext;
  stream: MediaStream;
  handlers: LiveCallHandlers;
}): Promise<LiveCall | null> {
  const { audio, stream, handlers } = options;
  if (Date.now() < liveQuotaPausedUntil) return null;
  handlers.onState("connecting");

  const requestSession = async (resumeHandle?: string) => {
    const response = await fetch(`/api/meetings/${options.meetingId}/live-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: options.voice, resumeHandle })
    });
    const session = (await response.json().catch(() => ({}))) as LiveSession & { error?: string };
    return { status: response.status, ok: response.ok && !!session.token && !!session.wsUrl, session };
  };

  const first = await requestSession();
  // 503 = realtime voice not available; the caller falls back.
  if (first.status === 503) return null;
  if (!first.ok) {
    handlers.onError(first.session.error ?? "Could not start the voice conversation.");
    return null;
  }

  // Google closes a Live connection after about 10 minutes (it warns first
  // with goAway). The page then reconnects on a new token with the latest
  // resumption handle, so the conversation carries on where it was.
  let socket: WebSocket | null = null;
  let resumeHandle = "";
  let reconnectAfterTurn = false;
  let reconnecting = false;
  // Attempts since the last connection that came up; stops a resume that
  // keeps failing from looping (each attempt mints a token).
  let attempts = 0;
  // The asker's voice pitch over each question decides how the assistant
  // addresses them (លោក / អ្នកស្រី / អ្នក) - see lib/client/voice-pitch.ts.
  const pitch = createPitchTracker();
  const activity = createLiveActivity((realtimeInput) => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (realtimeInput.activityEnd) {
      // Context for the answer, sent just before the question is closed;
      // turnComplete false so it is not taken as a question of its own.
      socket.send(
        JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: VOICE_NOTES[pitch.verdict()] }] }], turnComplete: false } })
      );
      pitch.reset();
    }
    socket.send(JSON.stringify({ realtimeInput }));
  });
  const playing: AudioBufferSourceNode[] = [];
  let nextStart = 0;
  let ended = false;
  let question = "";
  let answer = "";
  let pending: Float32Array[] = [];
  let recorder: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let sendTimer: ReturnType<typeof setInterval> | null = null;

  // The owner heard the voice go loud and soft on the phone. All playback
  // goes through a compressor that evens out the loudness, then a little
  // make-up gain so the levelled voice is not quieter overall.
  const leveller = audio.createDynamicsCompressor();
  leveller.threshold.value = -24;
  leveller.knee.value = 24;
  leveller.ratio.value = 4;
  leveller.attack.value = 0.003;
  leveller.release.value = 0.25;
  const makeUp = audio.createGain();
  makeUp.gain.value = 1.6;
  leveller.connect(makeUp);
  makeUp.connect(audio.destination);

  // On a phone the speaker is next to the microphone: while the AI talks,
  // the microphone hears it, Gemini takes that as the person interrupting
  // (choppy, loud-then-soft speech) and the next question arrives mixed
  // with the AI's own voice, heard badly and answered in the wrong
  // language. So the microphone is only sent while the AI is silent - one
  // side talks at a time, like a walkie-talkie; tapping interrupts.
  const aiIsTalking = () => playing.length > 0 || audio.currentTime < nextStart + ECHO_TAIL_S;

  const stopTalking = () => {
    playing.splice(0).forEach((node) => {
      try {
        node.stop();
      } catch {
        // Already finished.
      }
    });
    nextStart = 0;
    if (!ended) handlers.onState("listening");
  };

  const end = () => {
    if (ended) return;
    ended = true;
    if (sendTimer) clearInterval(sendTimer);
    recorder?.port.close();
    recorder?.disconnect();
    source?.disconnect();
    stopTalking();
    makeUp.disconnect();
    try {
      socket?.close();
    } catch {
      // Already closed.
    }
  };

  const startMicrophone = async () => {
    const url = URL.createObjectURL(new Blob([RECORDER_WORKLET], { type: "application/javascript" }));
    try {
      await audio.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (ended) return;
    source = audio.createMediaStreamSource(stream);
    recorder = new AudioWorkletNode(audio, "khmermeet-pcm-recorder");
    recorder.port.onmessage = (event: MessageEvent<Float32Array>) => pending.push(event.data);
    source.connect(recorder);
    sendTimer = setInterval(() => {
      if (!pending.length) return;
      if (socket?.readyState !== WebSocket.OPEN) {
        // Reconnecting: drop what was said in between rather than send it late.
        pending = [];
        return;
      }
      if (aiIsTalking()) {
        activity.reset();
        pitch.reset();
        pending = [];
        return;
      }
      const total = pending.reduce((sum, chunk) => sum + chunk.length, 0);
      const joined = new Float32Array(total);
      let offset = 0;
      for (const chunk of pending) {
        joined.set(chunk, offset);
        offset += chunk.length;
      }
      pending = [];
      let energy = 0;
      for (const sample of joined) energy += sample * sample;
      const pcm16 = downsampleToPcm16(joined, audio.sampleRate);
      const voice = new Int16Array(pcm16.buffer, pcm16.byteOffset, pcm16.length / 2);
      pitch.push(Float32Array.from(voice, (sample) => sample / 0x8000));
      activity.push(
        toBase64(pcm16),
        Math.sqrt(energy / joined.length),
        joined.length / audio.sampleRate * 1000
      );
    }, SEND_EVERY_MS);
    handlers.onState("listening");
  };

  const playChunk = (base64: string) => {
    const bytes = fromBase64(base64);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
    if (!samples.length) return;
    const buffer = audio.createBuffer(1, samples.length, OUTPUT_RATE);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) channel[index] = samples[index] / 0x8000;
    const node = audio.createBufferSource();
    node.buffer = buffer;
    node.connect(leveller);
    const startAt = Math.max(audio.currentTime + (playing.length ? 0.03 : JITTER_BUFFER_S), nextStart);
    node.start(startAt);
    nextStart = startAt + buffer.duration;
    playing.push(node);
    handlers.onState("speaking");
    node.onended = () => {
      const index = playing.indexOf(node);
      if (index >= 0) playing.splice(index, 1);
      if (!playing.length && !ended) handlers.onState("listening");
    };
  };

  // Hands the conversation over to the caller's slower path; what was said
  // so far is kept.
  const unavailable = () => {
    if (question.trim() || answer.trim()) handlers.onTurn(question.trim(), answer.trim());
    question = "";
    answer = "";
    end();
    handlers.onUnavailable();
  };

  const reconnect = async () => {
    if (reconnecting || ended) return;
    reconnecting = true;
    attempts++;
    reconnectAfterTurn = false;
    activity.reset();
    // Keep whatever was said before the connection went.
    if (question.trim() || answer.trim()) handlers.onTurn(question.trim(), answer.trim());
    question = "";
    answer = "";
    const old = socket;
    socket = null;
    if (old) {
      old.onclose = null;
      try {
        old.close();
      } catch {
        // Already closed.
      }
    }
    handlers.onState("connecting");
    try {
      const next = await requestSession(resumeHandle);
      if (ended) return;
      if (!next.ok) throw new Error(next.session.error);
      connect(next.session);
    } catch {
      if (ended) return;
      unavailable();
    } finally {
      reconnecting = false;
    }
  };

  const connect = (session: LiveSession) => {
    const ws = new WebSocket(`${session.wsUrl}?access_token=${encodeURIComponent(session.token)}`);
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ setup: session.setup }));
    ws.onmessage = async (event) => {
      const text = typeof event.data === "string" ? event.data : await (event.data as Blob).text();
      if (ws !== socket) return;
      let message: {
        setupComplete?: unknown;
        goAway?: unknown;
        sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
        serverContent?: {
          modelTurn?: { parts?: Array<{ inlineData?: { data?: string } }> };
          inputTranscription?: { text?: string };
          outputTranscription?: { text?: string };
          interrupted?: boolean;
          turnComplete?: boolean;
        };
      };
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }
      const update = message.sessionResumptionUpdate;
      if (update?.resumable && update.newHandle) resumeHandle = update.newHandle;
      // Finish the answer in progress, then move to a fresh connection;
      // if the connection closes first, onclose reconnects.
      if (message.goAway !== undefined) {
        if (question || answer || aiIsTalking()) reconnectAfterTurn = true;
        else void reconnect();
        return;
      }
      if (message.setupComplete !== undefined) {
        attempts = 0;
        if (recorder) {
          handlers.onState("listening");
          return;
        }
        void startMicrophone().catch(() => {
          handlers.onError("Could not start the microphone for the conversation.");
          end();
        });
        return;
      }
      const content = message.serverContent;
      if (!content) return;
      if (content.inputTranscription?.text) question += content.inputTranscription.text;
      if (content.outputTranscription?.text) answer += content.outputTranscription.text;
      // The person started talking over the answer - stop it at once.
      if (content.interrupted) stopTalking();
      for (const part of content.modelTurn?.parts ?? []) if (part.inlineData?.data) playChunk(part.inlineData.data);
      if (content.turnComplete) {
        if (question.trim() || answer.trim()) handlers.onTurn(question.trim(), answer.trim());
        question = "";
        answer = "";
        if (reconnectAfterTurn) void reconnect();
      }
    };
    ws.onclose = (event) => {
      if (ws !== socket || ended) return;
      const quota = event.code === 1011 && /quota/i.test(event.reason);
      if (quota) liveQuotaPausedUntil = Date.now() + QUOTA_PAUSE_MS;
      if (!quota && resumeHandle && attempts < 3) {
        void reconnect();
        return;
      }
      unavailable();
    };
  };

  connect(first.session);
  return { end, stopTalking };
}
