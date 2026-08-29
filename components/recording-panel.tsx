"use client";

import { CheckCircle2, Mic, Pause, Play, RotateCcw, Square, UserRoundCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uploadRecordingDirect } from "@/lib/client/direct-upload";
import { describeMicError } from "@/lib/mic-permission-error";
import { clampMeetingDurationSeconds, MAX_MEETING_DURATION_MS } from "@/lib/meeting-duration";
import { readJsonResponse } from "@/lib/read-json-response";

// Standalone room recording should capture the room as faithfully as possible.
// Browser noise suppression is tuned for close-talk calls and can erase quiet
// far-field speakers as "background"; the server-side ffmpeg pass handles
// denoise/leveling before transcription, where it can be retried safely.
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
  const safeSeconds = clampMeetingDurationSeconds(seconds);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
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
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const micMonitorFrameRef = useRef<number | null>(null);
  const maxMicLevelRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const [seconds, setSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [speakerNamesInput, setSpeakerNamesInput] = useState("");
  const [checkInName, setCheckInName] = useState("");
  const speakerNamesInputRef = useRef("");
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
    speakerNamesInputRef.current = speakerNamesInput;
  }, [speakerNamesInput]);

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
    // `stop` operates on refs and the interval must only follow recording state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    const restoreWakeLock = () => {
      if (document.visibilityState === "visible" && state === "recording") void requestRecordingWakeLock();
    };
    document.addEventListener("visibilitychange", restoreWakeLock);
    return () => document.removeEventListener("visibilitychange", restoreWakeLock);
  }, [state]);

  function getMimeType() {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  function getRecorderOptions(mimeType: string) {
    // Keep enough Opus/AAC detail for distant room voices. 32 kbps made
    // quiet syllables easier for the transcription model to miss or replace.
    return mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };
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

  function addCheckInName() {
    const nextName = checkInName.trim();
    if (!nextName) return;
    const currentNames = speakerNamesInputRef.current
      .split(/[,，\n]/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (currentNames.some((name) => name.toLocaleLowerCase() === nextName.toLocaleLowerCase())) {
      setCheckInName("");
      return;
    }
    const nextInput = [...currentNames, nextName].join(", ");
    speakerNamesInputRef.current = nextInput;
    setSpeakerNamesInput(nextInput);
    setCheckInName("");
  }

  function cleanupRecording() {
    void releaseRecordingWakeLock();
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

  async function requestRecordingWakeLock() {
    if (!("wakeLock" in navigator) || wakeLockRef.current || document.visibilityState !== "visible") return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      sentinel.addEventListener("release", () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
      });
    } catch {
      // Recording still works on browsers or devices that deny Wake Lock.
    }
  }

  async function releaseRecordingWakeLock() {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    await sentinel?.release().catch(() => undefined);
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

  // This only builds a lightweight analyser tap for the on-screen level
  // meter. MediaRecorder gets the real device track directly; transcription
  // enhancement happens server-side after the audio is safely saved.
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

  async function start() {
    setError("");
    setQuietWarning("");
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
      setError("Camera/Microphone មិនដំណើរការលើ HTTP LAN link ទេ។ សូមបើកតាម domain HTTPS របស់ app។");
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
          setQuietWarning(
            "សំឡេងហាក់ស្ងាត់ខ្លាំងកំឡុងពេលថត។ សូមស្តាប់ preview ខាងក្រោមឲ្យប្រាកដ - ការថតនេះនៅតែនឹងត្រូវរក្សាទុកដដែល។"
          );
        } else if (!("decodeError" in analysis) && analysis.peak < silentInputThreshold) {
          setQuietWarning(
            "ឯកសារសំឡេងហាក់ស្ងាត់ខ្លាំង។ សូមស្តាប់ preview ខាងក្រោមឲ្យប្រាកដ - ការថតនេះនៅតែនឹងត្រូវរក្សាទុកដដែល។"
          );
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
          await saveMeetingAuto(uploadedAudioUrl);
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "មិនអាច upload សំឡេងបានទេ។ សូមពិនិត្យ server ហើយសាកល្បងម្តងទៀត។"
          );
        } finally {
          setUploading(false);
          rawStream.getTracks().forEach((track) => track.stop());
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
      await requestRecordingWakeLock();
    } catch (error) {
      setError(describeMicError(error));
    }
  }

  async function saveMeetingAuto(savedAudioUrl: string) {
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
      const speakerNames = speakerNamesInputRef.current
        .split(/[,，\n]/)
        .map((name) => name.trim())
        .filter(Boolean)
        .slice(0, 100);
      const response = await fetch("/api/call-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || defaultMeetingTitle(),
          audioUrl: savedAudioUrl,
          transcript: "",
          duration: durationSeconds,
          languageMode: transcriptionLanguage,
          speakerNames
        })
      });
      const data = await readJsonResponse<{ meetingId?: string; error?: string; hint?: string }>(response);
      if (!response.ok || !data.meetingId) throw new Error(data.error ?? data.hint ?? "មិនអាចរក្សាទុកប្រជុំបានទេ។");
      setSavedMeetingId(data.meetingId);
      void transcribeCompleteRecording(data.meetingId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "មិនអាចរក្សាទុកប្រជុំបានទេ។ សូមសាកល្បងម្តងទៀត។");
    } finally {
      setSavingMeeting(false);
    }
  }

  async function transcribeCompleteRecording(meetingId: string) {
    setTranscriptionProgress("កំពុងកែលម្អគុណភាពសំឡេង និងបំលែងឯកសារពេញជាអក្សរ...");
    const speakerNames = speakerNamesInputRef.current
      .split(/[,，\n]/)
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, 100);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languageMode: transcriptionLanguage, speakerNames })
      });
      const data = await readJsonResponse<{ transcript?: string; error?: string }>(response);
      if (!response.ok || !data.transcript?.trim()) {
        throw new Error(data.error ?? "រកមិនឃើញសំឡេងនិយាយច្បាស់លាស់ក្នុងការថតនេះទេ។");
      }
      setTranscriptionProgress("បំលែងសំឡេងជាអក្សរ និងសម្អាតអត្ថបទរួចរាល់។ សូមបើកមើលប្រជុំដើម្បីត្រួតពិនិត្យ។");
    } catch (error) {
      setTranscriptionProgress(
        `បានរក្សាទុកសំឡេងរួច ប៉ុន្តែបំលែងជាអក្សរមិនបានទេ៖ ${error instanceof Error ? error.message : "សូមសាកល្បងម្តងទៀត។"}`
      );
    }
  }

  function pause() {
    void releaseRecordingWakeLock();
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
    void requestRecordingWakeLock();
  }

  function stop() {
    void releaseRecordingWakeLock();
    accumulatedMsRef.current += startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    startedAtRef.current = 0;
    setSeconds(clampMeetingDurationSeconds(Math.floor(accumulatedMsRef.current / 1000)));
    recorder.current?.stop();
    setState("stopped");
  }

  return (
    <div className="kh-card overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-leaf">Recorder</p>
            <h2 className="text-xl font-bold text-ink">ថតសំឡេងប្រជុំ</h2>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm">
            {state === "recording" ? "កំពុងថត" : state === "paused" ? "បានផ្អាក" : state === "stopped" ? "ថតរួច" : "រួចរាល់"}
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">
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
              onClick={() => void saveMeetingAuto(audioUrl)}
            >
              សាកល្បងរក្សាទុកម្តងទៀត
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
            <option value="km-en">ខ្មែរ + English</option>
            <option value="km">ខ្មែរ</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
      <div className="mb-4 rounded-lg border border-leaf/20 bg-leaf/10 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-leaf text-white">
            <UserRoundCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-base font-bold text-ink">បញ្ចូលឈ្មោះអ្នកចូលរួម</p>
              <p className="text-xs font-medium text-leaf">អាចបន្ថែមមុន ឬកំពុងថត</p>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="kh-input min-w-0 flex-1"
                value={checkInName}
                onChange={(event) => setCheckInName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCheckInName();
                  }
                }}
                placeholder="ឧទាហរណ៍៖ ដារ៉ា"
                disabled={state === "paused"}
              />
              <button
                className="kh-button-primary h-11 px-4"
                type="button"
                onClick={addCheckInName}
                disabled={state === "paused" || !checkInName.trim()}
              >
                បន្ថែម
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              ឈ្មោះដែលបន្ថែមនឹងត្រូវប្រើសម្រាប់សម្គាល់អ្នកនិយាយក្នុងអត្ថបទ។
            </p>
          </div>
        </div>
      </div>
      <div className="mb-4">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-600">ឈ្មោះអ្នកចូលរួម (ស្រេចចិត្ត)</span>
          <input
            className="kh-input"
            value={speakerNamesInput}
            onChange={(event) => setSpeakerNamesInput(event.target.value)}
            placeholder="ឧទាហរណ៍៖ ដារ៉ា, ចាន់ថា, សុខា"
            disabled={state === "recording" || state === "paused"}
          />
          <p className="text-xs text-slate-500">
            ជួយឲ្យការបំលែងជាអក្សរស្គាល់ឈ្មោះត្រឹមត្រូវជាងមុន (ដាក់ក្បាច់ខណ្ឌដោយសញ្ញា ,)
          </p>
        </label>
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-[1fr_240px]">
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
          <p className="text-xs text-slate-500">
            ថតពី microphone ដែលបានជ្រើស។ សម្រាប់ចាប់គ្រប់មាត់ក្នុងបន្ទប់ សូមប្រើ conference/external mic ឬដាក់ mic កណ្តាលតុ។
          </p>
        </label>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-600">Input level</p>
          <div className="h-10 rounded-lg border border-slate-200 bg-white p-1.5 shadow-inner">
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
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
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
            <button className="kh-button-primary min-h-11" onClick={start} type="button"><Mic className="h-4 w-4" />ចាប់ផ្តើមថត</button>
          ) : null}
          {state === "recording" ? <button className="kh-button-secondary min-h-11" onClick={pause} type="button"><Pause className="h-4 w-4" />ផ្អាក</button> : null}
          {state === "paused" ? <button className="kh-button-secondary min-h-11" onClick={resume} type="button"><Play className="h-4 w-4" />បន្ត</button> : null}
          {state === "recording" || state === "paused" ? <button className="kh-button-secondary min-h-11" onClick={stop} type="button"><Square className="h-4 w-4" />បញ្ឈប់</button> : null}
        </div>
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
    </div>
  );
}

