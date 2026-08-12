"use client";

import { CheckCircle2, Mic, Pause, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uploadRecordingDirect } from "@/lib/client/direct-upload";
import { describeMicError } from "@/lib/mic-permission-error";
import { readJsonResponse } from "@/lib/read-json-response";

// noiseSuppression back off: confirmed live (repeatedly) that quiet
// far-mic recordings were still coming back silent even after fixing the
// stream-graph bug below. The browser's suppressor runs before our own
// processing chain ever sees the signal, and it can attenuate quiet,
// non-close-talk speech hard enough that no amount of gain downstream can
// recover it - it doesn't just remove noise, it can remove the only signal
// there is. Our own gain/compressor/limiter chain amplifying background
// noise along with speech is a real trade-off, but a noisier-but-audible
// recording beats a clean-but-silent one.
const clearVoiceAudioConstraints: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
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
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function defaultMeetingTitle() {
  return `ការថតសំឡេង ${new Date().toLocaleString()}`;
}

export function RecordingPanel() {
  const recorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const segmentsRef = useRef<Blob[]>([]);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const micMonitorFrameRef = useRef<number | null>(null);
  const maxMicLevelRef = useRef(0);
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const [seconds, setSeconds] = useState(0);
  const [title, setTitle] = useState("");
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
      setSeconds(Math.max(1, Math.floor(elapsedMs / 1000)));
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 250);
    return () => clearInterval(timer);
  }, [state]);

  function getMimeType() {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  function getRecorderOptions(mimeType: string) {
    return mimeType ? { mimeType, audioBitsPerSecond: 96000 } : { audioBitsPerSecond: 96000 };
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

  async function measureRecordedAudioPeak(blob: Blob) {
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
      return peak;
    } catch {
      return null;
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

  async function buildRecordingStream(microphoneStream: MediaStream) {
    void recordingAudioContextRef.current?.close().catch(() => undefined);
    const audioContext = new AudioContext();
    recordingAudioContextRef.current = audioContext;
    await audioContext.resume().catch(() => undefined);

    const source = audioContext.createMediaStreamSource(microphoneStream);
    // Gain has to come BEFORE the compressor, not after: a DynamicsCompressorNode
    // only touches signal ABOVE its threshold - anything quieter passes through
    // completely unchanged. With gain applied after compression, distant speech
    // that never reaches the threshold got no help at all beyond a flat +13dB,
    // which measured out close to the same order of magnitude as the silence
    // cutoff below - explaining why "quiet but real" recordings kept getting
    // flagged as silent even after the stream-graph bug fix. Boosting first
    // means quiet speech actually gets pulled up; the compressor and limiter
    // after it then tame whatever ends up too loud (including speakers close
    // to the mic getting hit by this much gain).
    const preGain = audioContext.createGain();
    preGain.gain.value = 8;
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    // Final hard limiter - the actual clip-safety net now that preGain can
    // push a close speaker's signal well past 0dB.
    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    const destination = audioContext.createMediaStreamDestination();
    // Tap the level meter off the same graph feeding the recorder instead of
    // re-consuming destination.stream through a second AudioContext: handing
    // one MediaStreamDestinationNode track to two independent consumers is a
    // known Chromium/Windows footgun where the recorder's copy can end up
    // starved of samples (silent file) while the other consumer still sees
    // live levels.
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;

    source.connect(preGain);
    preGain.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(destination);
    limiter.connect(analyser);

    return { stream: destination.stream, analyser };
  }

  async function start() {
    setError("");
    setAudioUrl("");
    setPreviewUrl("");
    setSavedMeetingId("");
    setTranscriptionProgress("");
    cleanupRecording();
    if (!supported) {
      setError("Browser នេះមិនគាំទ្រ audio recording ទេ។ សូមប្រើ Chrome, Edge, ឬ Firefox ថ្មីៗ។");
      return;
    }
    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      setError("Camera/Microphone មិនដំណើរការលើ HTTP LAN link ទេ។ សូមប្រើ localhost លើកុំព្យូទ័រ ឬ deploy/open តាម HTTPS ដូចជា Vercel។");
      return;
    }
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints()
      });
      const [track] = rawStream.getAudioTracks();
      const { stream: recordingStream, analyser } = await buildRecordingStream(rawStream);
      streamRef.current = recordingStream;
      setActiveMicLabel(track?.label || "Default microphone");
      await loadAudioDevices();
      startMicMonitor(analyser);
      const mimeType = getMimeType();
      const media = new MediaRecorder(recordingStream, getRecorderOptions(mimeType));
      chunks.current = [];
      segmentsRef.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.current.push(event.data);
          if (event.data.size > 1000) segmentsRef.current.push(event.data);
        }
      };
      media.onstop = async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        const blobType = media.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type: blobType });
        const localPreview = URL.createObjectURL(blob);
        previewUrlRef.current = localPreview;
        setPreviewUrl(localPreview);
        if (maxMicLevelRef.current < silentInputThreshold) {
          setError(
            "No microphone sound was detected while recording. Choose the correct microphone, unmute it in Windows/browser settings, then record again."
          );
          rawStream.getTracks().forEach((track) => track.stop());
          recordingStream.getTracks().forEach((track) => track.stop());
          displayStreamRef.current?.getTracks().forEach((track) => track.stop());
          displayStreamRef.current = null;
          void recordingAudioContextRef.current?.close().catch(() => undefined);
          recordingAudioContextRef.current = null;
          stopMicMonitor();
          return;
        }
        const recordedPeak = await measureRecordedAudioPeak(blob);
        if (recordedPeak !== null && recordedPeak < silentInputThreshold) {
          setError(
            "The browser detected microphone activity, but the saved audio file is silent. Please switch microphone, restart the browser, then record again."
          );
          rawStream.getTracks().forEach((track) => track.stop());
          recordingStream.getTracks().forEach((track) => track.stop());
          displayStreamRef.current?.getTracks().forEach((track) => track.stop());
          displayStreamRef.current = null;
          void recordingAudioContextRef.current?.close().catch(() => undefined);
          recordingAudioContextRef.current = null;
          stopMicMonitor();
          return;
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
                    ? "សំឡេងធំពេក មិនអាច upload បានទេ។ សូមថតឱ្យខ្លីជាងនេះ។"
                    : "មិនអាចរក្សាទុកសំឡេងបានទេ។")
              );
            }
            uploadedAudioUrl = data.audioUrl;
          }
          setAudioUrl(uploadedAudioUrl);
          setDbUnavailable(false);
          await saveMeetingAuto(uploadedAudioUrl, blobType);
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "មិនអាច upload សំឡេងបានទេ។ សូមពិនិត្យ server ហើយសាកល្បងម្តងទៀត។"
          );
        } finally {
          setUploading(false);
          rawStream.getTracks().forEach((track) => track.stop());
          recordingStream.getTracks().forEach((track) => track.stop());
          displayStreamRef.current?.getTracks().forEach((track) => track.stop());
          displayStreamRef.current = null;
          void recordingAudioContextRef.current?.close().catch(() => undefined);
          recordingAudioContextRef.current = null;
          stopMicMonitor();
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
      const response = await fetch("/api/call-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || defaultMeetingTitle(),
          audioUrl: savedAudioUrl,
          transcript: "",
          duration: seconds,
          languageMode: transcriptionLanguage
        })
      });
      const data = await readJsonResponse<{ meetingId?: string; error?: string; hint?: string }>(response);
      if (!response.ok || !data.meetingId) throw new Error(data.error ?? data.hint ?? "មិនអាចរក្សាទុកប្រជុំបានទេ។");
      setSavedMeetingId(data.meetingId);
      void transcribeAndAttachSegments(data.meetingId, blobType);
    } catch (error) {
      setError(error instanceof Error ? error.message : "មិនអាចរក្សាទុកប្រជុំបានទេ។ សូមសាកល្បងម្តងទៀត។");
    } finally {
      setSavingMeeting(false);
    }
  }

  async function transcribeAndAttachSegments(meetingId: string, blobType: string) {
    const audioSegments = segmentsRef.current.filter((chunk) => chunk.size > 1000);
    if (!audioSegments.length) return;

    let successfulChunks = 0;
    let lastErrorMessage = "";
    setTranscriptionProgress(`កំពុងបំលែងសំឡេងជាអក្សរ 0/${audioSegments.length} ចម្រៀក...`);

    for (let index = 0; index < audioSegments.length; index += 1) {
      const chunk = audioSegments[index];
      const formData = new FormData();
      const chunkType = chunk.type || blobType;
      formData.append("audio", chunk, `meeting-part-${index + 1}.${chunkType.includes("mp4") ? "m4a" : "webm"}`);
      formData.append("languageMode", transcriptionLanguage);
      formData.append("index", String(index + 1));
      setTranscriptionProgress(`កំពុងបំលែងសំឡេងជាអក្សរ ${index + 1}/${audioSegments.length} ចម្រៀក...`);

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

    setTranscriptionProgress(
      successfulChunks
        ? `បំលែងជាអក្សររួចរាល់៖ ${successfulChunks}/${audioSegments.length} ចម្រៀកមានអត្ថបទ។ សូមបើកមើលប្រជុំដើម្បីត្រួតពិនិត្យ។`
        : lastErrorMessage
          ? `បានរក្សាទុកសំឡេងរួច ប៉ុន្តែបំលែងជាអក្សរមិនបានទេ៖ ${lastErrorMessage}`
          : "បានរក្សាទុកសំឡេងរួច ប៉ុន្តែរកមិនឃើញអត្ថបទសំឡេងច្បាស់លាស់ក្នុងចម្រៀកសំឡេងទាំងនោះទេ។"
    );
  }

  function pause() {
    recorder.current?.pause();
    accumulatedMsRef.current += startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    startedAtRef.current = 0;
    setSeconds(Math.max(1, Math.floor(accumulatedMsRef.current / 1000)));
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
    setSeconds(Math.max(1, Math.floor(accumulatedMsRef.current / 1000)));
    recorder.current?.stop();
    setState("stopped");
  }

  return (
    <div className="kh-card p-5">
      <div className="mb-4 rounded-lg border border-saffron/25 bg-saffron/10 p-3 text-sm text-ink">
        សូមប្រាកដថាអ្នកចូលរួមទាំងអស់យល់ព្រម មុននឹងចាប់ផ្តើមថតកិច្ចប្រជុំនេះ។
      </div>
      {dbUnavailable ? (
        <div className="mb-4 rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm text-ink">
          មិនអាចត្រួតពិនិត្យស្ថានភាព database ពី browser នេះបានទេ។ អ្នកនៅតែអាចថត ហើយសាកល្បងរក្សាទុកបាន server នឹងបញ្ជាក់នៅពេលរក្សាទុកជោគជ័យ។
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
              សាកល្បងរក្សាទុកម្តងទៀត
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-600">ចំណងជើងប្រជុំ (ស្រេចចិត្ត)</span>
          <input
            className="kh-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={defaultMeetingTitle()}
            disabled={state === "recording" || state === "paused"}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-600">ភាសាបំលែងជាអក្សរ</span>
          <select
            className="kh-input"
            value={transcriptionLanguage}
            onChange={(event) => setTranscriptionLanguage(event.target.value as "km" | "en" | "km-en")}
            disabled={state === "recording" || state === "paused" || uploading}
          >
            <option value="km">លទ្ធផលជាភាសាខ្មែរ</option>
            <option value="en">លទ្ធផលជាភាសាអង់គ្លេស</option>
            <option value="km-en">រក្សាទាំងខ្មែរ និងអង់គ្លេស</option>
          </select>
        </label>
      </div>
      <div className="mb-4 grid gap-4 sm:grid-cols-[1fr_220px]">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-600">Microphone</span>
          <select
            className="kh-input"
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
            disabled={state === "recording" || state === "paused" || uploading}
          >
            <option value="">Default microphone</option>
            {audioDevices.map((device, index) => (
              <option key={device.deviceId || index} value={device.deviceId}>
                {device.label || `Microphone ${index + 1}`}
              </option>
            ))}
          </select>
          {activeMicLabel && state !== "idle" ? <p className="text-xs text-slate-500">Using: {activeMicLabel}</p> : null}
          <p className="text-xs text-slate-500">Records from the selected microphone only.</p>
        </label>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-600">Input level</p>
          <div className="h-10 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
            <div
              className={`h-full rounded-md transition-all ${micLevel > 0.08 ? "bg-leaf" : "bg-saffron"}`}
              style={{ width: `${Math.max(4, Math.round(micLevel * 100))}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {state === "recording" ? (micLevel > 0.08 ? "Sound detected" : "Speak now - level is low") : "Start recording to test the mic"}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">ពេលវេលាថតសំឡេង</p>
          <p className="text-4xl font-bold tabular-nums text-ink">{formatTime(seconds)}</p>
          <p className="mt-1 text-sm text-slate-500">
            {state === "recording" ? "កំពុងថត..." : state === "paused" ? "បានផ្អាក" : state === "stopped" ? "ថតរួចរាល់" : "រួចរាល់សម្រាប់ថត"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state === "idle" || state === "stopped" ? (
            <button className="kh-button-primary" onClick={start} type="button"><Mic className="h-4 w-4" />ចាប់ផ្តើមថត</button>
          ) : null}
          {state === "recording" ? <button className="kh-button-secondary" onClick={pause} type="button"><Pause className="h-4 w-4" />ផ្អាក</button> : null}
          {state === "paused" ? <button className="kh-button-secondary" onClick={resume} type="button"><Play className="h-4 w-4" />បន្ត</button> : null}
          {state === "recording" || state === "paused" ? <button className="kh-button-secondary" onClick={stop} type="button"><Square className="h-4 w-4" />បញ្ឈប់</button> : null}
        </div>
      </div>
      {state === "stopped" ? (
        <div className="mt-6 space-y-4">
          {previewUrl ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-sm font-semibold text-ink">ស្តាប់សំឡេងដែលបានថត</p>
              <audio className="w-full" controls src={previewUrl} />
            </div>
          ) : null}
          {uploading ? (
            <p className="text-sm text-slate-500">កំពុង upload សំឡេង...</p>
          ) : savingMeeting ? (
            <p className="text-sm text-slate-500">កំពុងរក្សាទុកប្រជុំដោយស្វ័យប្រវត្តិ...</p>
          ) : savedMeetingId ? (
            <p className="flex items-center gap-2 text-sm text-leaf">
              <CheckCircle2 className="h-4 w-4" />
              បានរក្សាទុករួច។ <a className="font-semibold underline" href={`/meetings/${savedMeetingId}`}>មើលប្រជុំ</a>
            </p>
          ) : null}
          {transcriptionProgress ? <p className="text-sm text-slate-500">{transcriptionProgress}</p> : null}
          <button className="kh-button-secondary" onClick={start} type="button">
            <RotateCcw className="h-4 w-4" />
            ថតម្តងទៀត
          </button>
        </div>
      ) : null}
    </div>
  );
}
