"use client";

import { CheckCircle2, Mic, Pause, Play, RotateCcw, Square, UserRoundCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uploadRecordingDirect } from "@/lib/client/direct-upload";
import { describeMicError } from "@/lib/mic-permission-error";
import { clampMeetingDurationSeconds, MAX_MEETING_DURATION_MS } from "@/lib/meeting-duration";
import { readJsonResponse } from "@/lib/read-json-response";
import { useUiText } from "@/components/localized-text";

// noiseSuppression + autoGainControl on: on-screen diagnostics proved (not
// guessed) that MediaRecorder does not faithfully capture what's sent to a
// synthesized MediaStreamDestinationNode on this browser/OS - a live level
// meter tapped from the same processing chain read 0.00551 while the
// actual decoded recording read 0.00001, ~550x smaller, from the exact same
// signal. That's not a quiet-audio problem, it's this hand-off losing
// almost everything. So the custom compressor/gain/limiter chain has been
// removed for the recorded track; MediaRecorder now gets the raw device
// track, and the browser's own native processing is the only thing boosting
// it, since that's what actually reaches MediaRecorder intact.
const clearVoiceAudioConstraints: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 }
};

// Recordings pick up speakers away from the device (an ambient room mic,
// not someone talking directly into it), so quiet voices sit closer to the
// noise floor than a close-talk mic would - keep this low to avoid flagging
// legitimate far-field audio as silent.
const silentInputThreshold = 0.0012;

function formatTime(seconds: number) {
  const safeSeconds = clampMeetingDurationSeconds(seconds);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function defaultMeetingTitle(prefix: string) {
  return `${prefix} ${new Date().toLocaleString()}`;
}

function fillTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

export function RecordingPanel() {
  const text = useUiText();
  const recorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const segmentsRef = useRef<Blob[]>([]);
  const segmentRecorderRef = useRef<MediaRecorder | null>(null);
  const segmentStreamRef = useRef<MediaStream | null>(null);
  const segmentingRef = useRef(false);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const micMonitorFrameRef = useRef<number | null>(null);
  const maxMicLevelRef = useRef(0);
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const [seconds, setSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [speakerNamesInput, setSpeakerNamesInput] = useState("");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [activeMicLabel, setActiveMicLabel] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [savedMeetingId, setSavedMeetingId] = useState("");
  const [transcriptionProgress, setTranscriptionProgress] = useState("");
  const [dbUnavailable, setDbUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [quietWarning, setQuietWarning] = useState("");
  // Default to km-en so mixed Khmer/English meetings are captured as spoken
  // instead of English getting silently translated into Khmer under "km" mode.
  const [transcriptionLanguage, setTranscriptionLanguage] = useState<"km" | "en" | "km-en">("km-en");

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "MediaRecorder" in window &&
        Boolean(navigator.mediaDevices?.getUserMedia)
    );
    fetch("/api/health", { cache: "no-store" })
      .then((response) => setDbUnavailable(!response.ok))
      .catch(() => setDbUnavailable(true));
    void loadAudioDevices();

    return () => cleanupRecording();
    // cleanupRecording only touches refs and should run once on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== "recording") return;
    const updateElapsed = () => {
      const elapsedMs = accumulatedMsRef.current + (startedAtRef.current ? Date.now() - startedAtRef.current : 0);
      setSeconds(clampMeetingDurationSeconds(Math.floor(elapsedMs / 1000)));
      if (elapsedMs >= MAX_MEETING_DURATION_MS) stop();
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 250);
    return () => clearInterval(timer);
    // stop() only touches recorder refs/state; keeping this effect keyed to
    // recording state avoids recreating the interval on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function getMimeType() {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  function getRecorderOptions(mimeType: string) {
    return mimeType ? { mimeType, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 };
  }

  async function loadAudioDevices() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    setAudioDevices(devices.filter((device) => device.kind === "audioinput"));
  }

  function buildAudioConstraints(): MediaTrackConstraints {
    return selectedDeviceId
      ? { ...clearVoiceAudioConstraints, deviceId: { exact: selectedDeviceId } }
      : clearVoiceAudioConstraints;
  }

  function cleanupRecording() {
    stopMicMonitor();
    stopSegmentRecorder();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    displayStreamRef.current?.getTracks().forEach((track) => track.stop());
    displayStreamRef.current = null;
    void recordingAudioContextRef.current?.close().catch(() => undefined);
    recordingAudioContextRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  function stopMicMonitor() {
    if (micMonitorFrameRef.current !== null) {
      cancelAnimationFrame(micMonitorFrameRef.current);
      micMonitorFrameRef.current = null;
    }
    setMicLevel(0);
  }

  async function analyzeRecordedAudio(blob: Blob) {
    try {
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
      let peak = 0;
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
        const samples = audioBuffer.getChannelData(channel);
        for (let index = 0; index < samples.length; index += 1) {
          peak = Math.max(peak, Math.abs(samples[index]));
        }
      }
      await audioContext.close().catch(() => undefined);
      return { peak };
    } catch (error) {
      return { decodeError: error instanceof Error ? error.message : String(error) };
    }
  }

  function encodeAudioBufferAsWav(audioBuffer: AudioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bitsPerSample = 16;
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataLength = audioBuffer.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    const writeString = (offset: number, text: string) => {
      for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, "data");
    view.setUint32(40, dataLength, true);

    let offset = 44;
    const channelData = Array.from({ length: numChannels }, (_, channel) => audioBuffer.getChannelData(channel));
    for (let sampleIndex = 0; sampleIndex < audioBuffer.length; sampleIndex += 1) {
      for (let channel = 0; channel < numChannels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][sampleIndex]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  // Boosts quiet/distant speech for transcription ONLY - does not touch the
  // recording/upload path at all. Earlier testing proved MediaRecorder does
  // not faithfully capture what's routed through a real-time
  // MediaStreamDestinationNode on this browser/OS (a live analyser read real
  // signal while the actual recorded file read ~0), which is why the
  // recorder now uses the raw device track directly with no custom
  // processing. OfflineAudioContext is a different, non-realtime rendering
  // path with no such issue - it decodes an already-recorded (faithfully
  // captured) blob and renders a boosted copy entirely in-memory, never
  // touching MediaRecorder. Used only for the copy sent to the
  // transcription API; the original blob is still what gets uploaded/saved/
  // played back.
  async function boostAudioForTranscription(blob: Blob): Promise<Blob> {
    try {
      const decodeContext = new AudioContext();
      const audioBuffer = await decodeContext.decodeAudioData(await blob.arrayBuffer());
      await decodeContext.close().catch(() => undefined);

      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;

      const preGain = offlineContext.createGain();
      preGain.gain.value = 8;
      const compressor = offlineContext.createDynamicsCompressor();
      compressor.threshold.value = -30;
      compressor.knee.value = 30;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      const limiter = offlineContext.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;

      source.connect(preGain);
      preGain.connect(compressor);
      compressor.connect(limiter);
      limiter.connect(offlineContext.destination);
      source.start();

      const renderedBuffer = await offlineContext.startRendering();
      return encodeAudioBufferAsWav(renderedBuffer);
    } catch {
      // If boosting fails for any reason, fall back to the original audio
      // rather than losing the segment entirely.
      return blob;
    }
  }

  function startMicMonitor(analyser: AnalyserNode) {
    stopMicMonitor();
    maxMicLevelRef.current = 0;

    const data = new Uint8Array(analyser.fftSize);
    const updateLevel = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / data.length);
      maxMicLevelRef.current = Math.max(maxMicLevelRef.current, rms);
      setMicLevel(Math.min(1, rms * 12));
      micMonitorFrameRef.current = requestAnimationFrame(updateLevel);
    };
    updateLevel();
  }

  // On-screen diagnostics proved this, not a guess: a live analyser tapped
  // from the processed graph (source -> gain -> compressor -> limiter ->
  // destination) read a real max level of 0.00551, while the actual decoded
  // recording from that same destination read 0.00001 - about 550x smaller,
  // from the identical signal. MediaRecorder does not faithfully capture
  // what's sent to a synthesized MediaStreamDestinationNode on this
  // browser/OS. So this only builds a lightweight analyser tap for the
  // on-screen level meter now - it does not feed the recording at all.
  // MediaRecorder gets the raw device track directly (see start() below),
  // with noiseSuppression/autoGainControl as the only processing, since
  // that's what's actually proven to reach it intact.
  async function buildLevelAnalyser(microphoneStream: MediaStream) {
    void recordingAudioContextRef.current?.close().catch(() => undefined);
    const audioContext = new AudioContext();
    recordingAudioContextRef.current = audioContext;
    await audioContext.resume().catch(() => undefined);
    const source = audioContext.createMediaStreamSource(microphoneStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    return analyser;
  }

  // The main recorder's ondataavailable chunks used to be pushed directly
  // into segmentsRef and sent to transcribe-chunk as if each were a
  // standalone file. They aren't: with a timesliced MediaRecorder, only the
  // FIRST chunk contains the WebM container header - every chunk after that
  // is a headerless fragment that isn't independently decodable. Confirmed
  // live: transcripts were accurate for the first ~10s of a recording, then
  // wrong and hallucinated for everything after, exactly matching "later
  // segments are malformed audio fed to the model." livekit-call-room.tsx
  // already avoids this correctly by starting a fresh MediaRecorder for each
  // segment instead of relying on timeslice chunks - same fix here.
  function startSegmentRecorder(stream: MediaStream, mimeType: string) {
    // Cutting a segment at a fixed time mark regardless of where natural
    // speech pauses fall means some sentences land split across two
    // segments - whichever half lands in a chunk gets fed to the model
    // without the rest of the sentence for context, and that specific
    // sentence comes back wrong while sentences that happened to land
    // fully inside one segment transcribe fine. Confirmed live: errors were
    // scattered ("some sentences right, some wrong") rather than
    // concentrated at the end, which is the signature of this rather than
    // the header-corruption bug fixed earlier. Longer segments mean fewer
    // cut points per minute of speech, so fewer sentences get split.
    const segmentMs = 25000;
    segmentingRef.current = true;
    segmentsRef.current = [];
    // Cloned tracks so this independent recorder isn't sharing the exact
    // same live MediaStreamTrack as the main recorder (a different,
    // previously-confirmed bug where two MediaRecorders on one track can
    // starve one of them of data).
    const segmentStream = new MediaStream(stream.getAudioTracks().map((track) => track.clone()));
    segmentStreamRef.current = segmentStream;

    const recordNextSegment = () => {
      if (!segmentingRef.current) return;
      const media = new MediaRecorder(segmentStream, getRecorderOptions(mimeType));
      const parts: Blob[] = [];
      segmentRecorderRef.current = media;

      media.ondataavailable = (event) => {
        if (event.data.size > 0) parts.push(event.data);
      };
      media.onstop = () => {
        const segmentType = media.mimeType || mimeType || "audio/webm";
        const segment = new Blob(parts, { type: segmentType });
        if (segment.size > 1000) segmentsRef.current.push(segment);
        if (segmentingRef.current) window.setTimeout(recordNextSegment, 0);
      };

      media.start();
      window.setTimeout(() => {
        if (media.state !== "inactive") media.stop();
      }, segmentMs);
    };

    recordNextSegment();
  }

  function stopSegmentRecorder() {
    segmentingRef.current = false;
    const media = segmentRecorderRef.current;
    if (media && media.state !== "inactive") media.stop();
    segmentStreamRef.current?.getTracks().forEach((track) => track.stop());
    segmentStreamRef.current = null;
  }

  async function start() {
    setError("");
    setQuietWarning("");
    setAudioUrl("");
    setPreviewUrl("");
    setSavedMeetingId("");
    setTranscriptionProgress("");
    cleanupRecording();
    if (!supported) {
      setError(text.browserRecordingUnsupported);
      return;
    }
    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      setError(text.secureContextRequired);
      return;
    }
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints()
      });
      const [track] = rawStream.getAudioTracks();
      streamRef.current = rawStream;
      setActiveMicLabel(track?.label || "Default microphone");
      await loadAudioDevices();
      const analyser = await buildLevelAnalyser(rawStream);
      startMicMonitor(analyser);
      const mimeType = getMimeType();
      const media = new MediaRecorder(rawStream, getRecorderOptions(mimeType));
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      startSegmentRecorder(rawStream, mimeType);
      media.onstop = async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        const blobType = media.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type: blobType });
        const localPreview = URL.createObjectURL(blob);
        previewUrlRef.current = localPreview;
        setPreviewUrl(localPreview);
        setQuietWarning("");
        // This check has been wrong before (flagged real, audible recordings
        // as silent) and there is no way to verify audio DSP tuning without
        // actually hearing it. So it must never be the only thing standing
        // between the user and their recording: warn, but always still save
        // it - the preview player above lets them judge for themselves, and
        // a save that turns out fine beats a block that turns out wrong.
        const analysis = await analyzeRecordedAudio(blob);
        if (maxMicLevelRef.current < silentInputThreshold) {
          setQuietWarning(text.quietRecordingWarning);
        } else if (!("decodeError" in analysis) && analysis.peak < silentInputThreshold) {
          setQuietWarning(text.quietFileWarning);
        }
        setUploading(true);
        try {
          let uploadedAudioUrl: string;
          try {
            // Direct-to-Supabase upload bypasses Vercel's hard 4.5MB
            // request-body limit, so long (multi-hour) recordings can
            // still be saved. Falls through to the server-relayed path
            // below when this isn't available (e.g. Supabase Storage not
            // configured) - that path is only reliable for shorter clips.
            uploadedAudioUrl = await uploadRecordingDirect(blob);
          } catch {
            const formData = new FormData();
            formData.append("audio", blob, blobType.includes("mp4") ? "meeting.m4a" : "meeting.webm");
            formData.append("languageMode", transcriptionLanguage);
            formData.append("skipTranscription", "true");
            const response = await fetch("/api/uploads", { method: "POST", body: formData });
            const data = await readJsonResponse<{ audioUrl?: string; error?: string }>(response);
            if (!response.ok || !data.audioUrl) {
              throw new Error(
                data.error ??
                  (response.status === 413
                    ? text.audioTooLarge
                    : text.saveAudioFailed)
              );
            }
            uploadedAudioUrl = data.audioUrl;
          }
          setAudioUrl(uploadedAudioUrl);
          setDbUnavailable(false);
          await saveMeetingAuto(uploadedAudioUrl, blobType);
        } catch (error) {
          setError(
            error instanceof Error ? error.message : text.uploadAudioFailed
          );
        } finally {
          setUploading(false);
          rawStream.getTracks().forEach((track) => track.stop());
          displayStreamRef.current?.getTracks().forEach((track) => track.stop());
          displayStreamRef.current = null;
          void recordingAudioContextRef.current?.close().catch(() => undefined);
          recordingAudioContextRef.current = null;
          stopMicMonitor();
          stopSegmentRecorder();
        }
      };
      recorder.current = media;
      media.start(10000);
      startedAtRef.current = Date.now();
      accumulatedMsRef.current = 0;
      setSeconds(0);
      setState("recording");
    } catch (error) {
      setError(describeMicError(error));
    }
  }

  async function saveMeetingAuto(savedAudioUrl: string, blobType: string) {
    setSavingMeeting(true);
    setError("");
    try {
      // Not the `seconds` state: media.onstop (which calls this) is a closure
      // created back when start() first ran, when `seconds` was just reset to
      // 0 - later setSeconds() calls from stop() don't retroactively update
      // that already-created closure, so it always sent the stale value from
      // recording start (confirmed live: minutes-long recordings saved as
      // "0 seconds"). accumulatedMsRef is a ref, not state, so reading
      // .current here always gets the true final elapsed time regardless of
      // when this closure was created.
      const durationSeconds = clampMeetingDurationSeconds(Math.floor(accumulatedMsRef.current / 1000));
      // Passed through to the transcription prompt as a vocabulary hint (see
      // lib/ai/openrouter.ts's transcriptionChatPrompt) so the model has a
      // chance to correctly recognize a name from the audio itself - a
      // misheard name can't be recovered by the later text-only refine pass,
      // which has no access to the audio to re-check against.
      const speakerNames = speakerNamesInput
        .split(/[,，\n]/)
        .map((name) => name.trim())
        .filter(Boolean)
        .slice(0, 100);
      const response = await fetch("/api/call-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || defaultMeetingTitle(text.recordingDefaultTitlePrefix),
          audioUrl: savedAudioUrl,
          transcript: "",
          duration: durationSeconds,
          languageMode: transcriptionLanguage,
          speakerNames
        })
      });
      const data = await readJsonResponse<{ meetingId?: string; error?: string; hint?: string }>(response);
      if (!response.ok || !data.meetingId) throw new Error(data.error ?? data.hint ?? text.saveMeetingFailed);
      setSavedMeetingId(data.meetingId);
      void transcribeAndAttachSegments(data.meetingId, blobType);
    } catch (error) {
      setError(error instanceof Error ? error.message : text.saveMeetingFailedRetry);
    } finally {
      setSavingMeeting(false);
    }
  }

  async function transcribeAndAttachSegments(meetingId: string, blobType: string) {
    const audioSegments = segmentsRef.current.filter((chunk) => chunk.size > 1000);
    if (!audioSegments.length) return;

    let successfulChunks = 0;
    let lastErrorMessage = "";
    setTranscriptionProgress(fillTemplate(text.transcribingProgress, { current: 0, total: audioSegments.length }));

    for (let index = 0; index < audioSegments.length; index += 1) {
      const chunk = audioSegments[index];
      // Boost this segment's copy before sending it for transcription (does
      // not affect the saved recording at all - see boostAudioForTranscription).
      const boosted = await boostAudioForTranscription(chunk);
      const formData = new FormData();
      const isWav = boosted.type === "audio/wav";
      const chunkType = isWav ? "audio/wav" : chunk.type || blobType;
      formData.append(
        "audio",
        boosted,
        isWav ? `meeting-part-${index + 1}.wav` : `meeting-part-${index + 1}.${chunkType.includes("mp4") ? "m4a" : "webm"}`
      );
      formData.append("languageMode", transcriptionLanguage);
      formData.append("index", String(index + 1));
      setTranscriptionProgress(fillTemplate(text.transcribingProgress, { current: index + 1, total: audioSegments.length }));

      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await fetch(`/api/meetings/${meetingId}/transcribe-chunk`, { method: "POST", body: formData });
          const data = await readJsonResponse<{ transcript?: string; error?: string }>(response);
          // A 2xx response (including "no usable speech") is final - only a
          // real request failure below is worth retrying.
          if (response.ok) {
            if (typeof data.transcript === "string" && data.transcript.trim()) successfulChunks += 1;
            break;
          }
          lastErrorMessage = data.error ?? lastErrorMessage;
        } catch (error) {
          // Keep processing the next chunk so one weak audio section does not block a long meeting.
          lastErrorMessage = error instanceof Error ? error.message : lastErrorMessage;
        }
        if (attempt < maxAttempts) await new Promise((resolve) => window.setTimeout(resolve, 2000 * attempt));
      }
    }

    // Live per-chunk transcription skips the refine/cleanup pass for
    // latency (each chunk needs to come back fast while still recording),
    // so the accumulated transcript comes back with raw, unrefined spacing.
    // One pass over the whole thing now that recording is done.
    if (successfulChunks > 0) {
      setTranscriptionProgress(text.cleaningTranscript);
      await fetch(`/api/meetings/${meetingId}/finalize-transcript`, { method: "POST" }).catch(() => undefined);
    }

    setTranscriptionProgress(
      successfulChunks
        ? fillTemplate(text.transcriptionDoneProgress, { success: successfulChunks, total: audioSegments.length })
        : lastErrorMessage
          ? fillTemplate(text.transcriptionFailedAfterSave, { error: lastErrorMessage })
          : text.noClearSpeechAfterSave
    );
  }

  function pause() {
    recorder.current?.pause();
    accumulatedMsRef.current += startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    startedAtRef.current = 0;
    setSeconds(clampMeetingDurationSeconds(Math.floor(accumulatedMsRef.current / 1000)));
    setState("paused");
  }

  function resume() {
    recorder.current?.resume();
    startedAtRef.current = Date.now();
    setState("recording");
  }

  function stop() {
    accumulatedMsRef.current += startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    startedAtRef.current = 0;
    setSeconds(clampMeetingDurationSeconds(Math.floor(accumulatedMsRef.current / 1000)));
    stopSegmentRecorder();
    recorder.current?.stop();
    setState("stopped");
  }

  return (
    <div className="kh-card p-5">
      <div className="mb-4 rounded-lg border border-saffron/25 bg-saffron/10 p-3 text-sm text-ink">
        {text.recordingConsent}
      </div>
      {dbUnavailable ? (
        <div className="mb-4 rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm text-ink">
          {text.databaseBrowserWarning}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          {!savedMeetingId && audioUrl ? (
            <button
              className="mt-2 font-semibold underline"
              type="button"
              onClick={() => void saveMeetingAuto(audioUrl, recorder.current?.mimeType || "audio/webm")}
            >
              {text.retrySave}
            </button>
          ) : null}
        </div>
      ) : null}
      {quietWarning ? (
        <div className="mb-4 rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm text-ink">
          {quietWarning}
        </div>
      ) : null}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-600">{text.optionalMeetingTitle}</span>
          <input
            className="kh-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={defaultMeetingTitle(text.recordingDefaultTitlePrefix)}
            disabled={state === "recording" || state === "paused"}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-600">{text.transcriptionLanguage}</span>
          <select
            className="kh-input"
            value={transcriptionLanguage}
            onChange={(event) => setTranscriptionLanguage(event.target.value as "km" | "en" | "km-en")}
            disabled={state === "recording" || state === "paused" || uploading}
          >
            <option value="km">{text.khmerOutput}</option>
            <option value="en">{text.englishOutput}</option>
            <option value="km-en">{text.mixedOutput}</option>
          </select>
        </label>
      </div>
      <div className="mb-4 rounded-xl border border-leaf/30 bg-leaf/10 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-leaf text-white">
            <UserRoundCheck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-base font-bold text-ink">Voice check-in / ប្រាប់ឈ្មោះតាមសំឡេង</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              At the start of the recording, each participant should say: “ខ្ញុំឈ្មោះ [name]”. KhmerMeet will try to remember that voice inside this meeting and label later turns with the same name.
            </p>
            <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <div className="rounded-lg bg-white p-3">
                <span className="font-semibold text-leaf">Example</span>
                <p className="mt-1">ចយ: ខ្ញុំឈ្មោះ ចយ</p>
              </div>
              <div className="rounded-lg bg-white p-3">
                <span className="font-semibold text-leaf">Transcript label</span>
                <p className="mt-1">ចយ: ខ្ញុំយល់ព្រម...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mb-4">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-600">{text.participantNamesOptional}</span>
          <input
            className="kh-input"
            value={speakerNamesInput}
            onChange={(event) => setSpeakerNamesInput(event.target.value)}
            placeholder={text.participantNamesExample}
            disabled={state === "recording" || state === "paused"}
          />
          <p className="text-xs text-slate-500">
            {text.participantNamesHelp}
          </p>
        </label>
      </div>
      <div className="mb-4 grid gap-4 sm:grid-cols-[1fr_220px]">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-600">{text.microphone}</span>
          <select
            className="kh-input"
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
            disabled={state === "recording" || state === "paused" || uploading}
          >
            <option value="">{text.defaultMicrophone}</option>
            {audioDevices.map((device, index) => (
              <option key={device.deviceId || index} value={device.deviceId}>
                {device.label || `Microphone ${index + 1}`}
              </option>
            ))}
          </select>
          {activeMicLabel && state !== "idle" ? <p className="text-xs text-slate-500">{text.usingMicrophone}: {activeMicLabel}</p> : null}
          <p className="text-xs text-slate-500">{text.selectedMicOnly}</p>
        </label>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-600">{text.inputLevel}</p>
          <div className="h-10 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
            <div
              className={`h-full rounded-md transition-all ${micLevel > 0.08 ? "bg-leaf" : "bg-saffron"}`}
              style={{ width: `${Math.max(4, Math.round(micLevel * 100))}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {state === "recording" ? (micLevel > 0.08 ? text.soundDetected : text.speakNowLow) : text.startRecordingToTestMic}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">{text.recordingTime}</p>
          <p className="text-4xl font-bold tabular-nums text-ink">{formatTime(seconds)}</p>
          <p className="mt-1 text-sm text-slate-500">
            {state === "recording" ? text.recordingNow : state === "paused" ? text.paused : state === "stopped" ? text.stopped : text.readyToRecord}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state === "idle" || state === "stopped" ? (
            <button className="kh-button-primary" onClick={start} type="button"><Mic className="h-4 w-4" />{text.startRecording}</button>
          ) : null}
          {state === "recording" ? <button className="kh-button-secondary" onClick={pause} type="button"><Pause className="h-4 w-4" />{text.pause}</button> : null}
          {state === "paused" ? <button className="kh-button-secondary" onClick={resume} type="button"><Play className="h-4 w-4" />{text.resume}</button> : null}
          {state === "recording" || state === "paused" ? <button className="kh-button-secondary" onClick={stop} type="button"><Square className="h-4 w-4" />{text.stop}</button> : null}
        </div>
      </div>
      {state === "stopped" ? (
        <div className="mt-6 space-y-4">
          {previewUrl ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-sm font-semibold text-ink">{text.listenPreview}</p>
              <audio className="w-full" controls src={previewUrl} />
            </div>
          ) : null}
          {uploading ? (
            <p className="text-sm text-slate-500">{text.uploadingAudio}</p>
          ) : savingMeeting ? (
            <p className="text-sm text-slate-500">{text.savingMeetingAuto}</p>
          ) : savedMeetingId ? (
            <p className="flex items-center gap-2 text-sm text-leaf">
              <CheckCircle2 className="h-4 w-4" />
              {text.savedDone} <a className="font-semibold underline" href={`/meetings/${savedMeetingId}`}>{text.viewMeeting}</a>
            </p>
          ) : null}
          {transcriptionProgress ? <p className="text-sm text-slate-500">{transcriptionProgress}</p> : null}
          <button className="kh-button-secondary" onClick={start} type="button">
            <RotateCcw className="h-4 w-4" />
            {text.recordAgain}
          </button>
        </div>
      ) : null}
    </div>
  );
}
