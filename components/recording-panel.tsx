"use client";

import { Mic, Pause, Play, RotateCcw, Save, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createMeeting } from "@/lib/actions";
import { readJsonResponse } from "@/lib/read-json-response";

const clearVoiceAudioConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 }
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function recordingPermissionHelp() {
  return "មិនអាចបើក microphone បានទេ។ សូមចុច Allow ក្នុង browser permission, ប្រើ Chrome/Edge/Safari ថ្មីៗ, ហើយកុំបើកក្នុង Facebook/Telegram in-app browser។";
}

export function RecordingPanel() {
  const recorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const segmentRecorderRef = useRef<MediaRecorder | null>(null);
  const segmentsRef = useRef<Blob[]>([]);
  const segmentingRef = useRef(false);
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState("");
  const [dbUnavailable, setDbUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [transcriptionLanguage, setTranscriptionLanguage] = useState<"km" | "en">("km");

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "MediaRecorder" in window &&
        Boolean(navigator.mediaDevices?.getUserMedia)
    );
    fetch("/api/health", { cache: "no-store" })
      .then((response) => setDbUnavailable(!response.ok))
      .catch(() => setDbUnavailable(true));

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

  function cleanupRecording() {
    stopSegmentRecorder();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  function startSegmentRecorder(stream: MediaStream, mimeType: string) {
    const segmentMs = 10000;
    segmentingRef.current = true;
    segmentsRef.current = [];

    const recordNextSegment = () => {
      if (!segmentingRef.current) return;
      const media = new MediaRecorder(stream, getRecorderOptions(mimeType));
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
  }

  async function start() {
    setError("");
    setAudioUrl("");
    setTranscript("");
    setPreviewUrl("");
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: clearVoiceAudioConstraints
      });
      const mimeType = getMimeType();
      const media = new MediaRecorder(stream, getRecorderOptions(mimeType));
      streamRef.current = stream;
      chunks.current = [];
      segmentsRef.current = [];
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
        setUploading(true);
        const formData = new FormData();
        formData.append("audio", blob, blobType.includes("mp4") ? "meeting.m4a" : "meeting.webm");
        formData.append("languageMode", transcriptionLanguage);
        formData.append("skipTranscription", "true");
        try {
          const response = await fetch("/api/uploads", { method: "POST", body: formData });
          const data = await readJsonResponse<{ audioUrl?: string; transcript?: string; error?: string }>(response);
          if (response.ok) {
            if (!data.audioUrl) throw new Error("Audio upload did not return a saved file URL.");
            setAudioUrl(data.audioUrl);
            setDbUnavailable(false);
            void transcribeLocalSegments(blobType);
          }
          else setError(data.error ?? "មិនអាចរក្សាទុកសំឡេងបានទេ។");
        } catch {
          setError("មិនអាច upload សំឡេងបានទេ។ សូមពិនិត្យ server ហើយសាកល្បងម្តងទៀត។");
        } finally {
          setUploading(false);
          stream.getTracks().forEach((track) => track.stop());
        }
      };
      recorder.current = media;
      startSegmentRecorder(stream, mimeType);
      media.start(5000);
      startedAtRef.current = Date.now();
      accumulatedMsRef.current = 0;
      setSeconds(0);
      setState("recording");
    } catch {
      setError(recordingPermissionHelp());
    }
  }

  async function transcribeLocalSegments(blobType: string) {
    const audioSegments = segmentsRef.current.filter((chunk) => chunk.size > 1000);
    if (!audioSegments.length) return;

    setTranscribing(true);
    setTranscriptionProgress(`Transcribing 0/${audioSegments.length} audio segments...`);
    const transcriptParts: string[] = [];

    for (let index = 0; index < audioSegments.length; index += 1) {
      const chunk = audioSegments[index];
      const formData = new FormData();
      const chunkType = chunk.type || blobType;
      formData.append("audio", chunk, `meeting-part-${index + 1}.${chunkType.includes("mp4") ? "m4a" : "webm"}`);
      formData.append("languageMode", transcriptionLanguage);
      setTranscriptionProgress(`Transcribing ${index + 1}/${audioSegments.length} audio segments...`);

      try {
        const response = await fetch("/api/live-transcript", { method: "POST", body: formData });
        const data = await readJsonResponse<{ transcript?: string; error?: string }>(response);
        if (response.ok && typeof data.transcript === "string" && data.transcript.trim()) {
          transcriptParts.push(data.transcript.trim());
          setTranscript(transcriptParts.join("\n"));
        }
      } catch {
        // Keep processing the next chunk so one weak audio section does not block a long meeting.
      }
    }

    setTranscriptionProgress(
      transcriptParts.length
        ? `Transcription complete: ${transcriptParts.length}/${audioSegments.length} segments produced text.`
        : "Audio saved, but no clear speech text was detected in the audio segments."
    );
    setTranscribing(false);
  }

  function pause() {
    recorder.current?.pause();
    if (segmentRecorderRef.current?.state === "recording") segmentRecorderRef.current.pause();
    accumulatedMsRef.current += startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    startedAtRef.current = 0;
    setSeconds(Math.max(1, Math.floor(accumulatedMsRef.current / 1000)));
    setState("paused");
  }

  function resume() {
    recorder.current?.resume();
    if (segmentRecorderRef.current?.state === "paused") segmentRecorderRef.current.resume();
    startedAtRef.current = Date.now();
    setState("recording");
  }

  function stop() {
    accumulatedMsRef.current += startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    startedAtRef.current = 0;
    setSeconds(Math.max(1, Math.floor(accumulatedMsRef.current / 1000)));
    stopSegmentRecorder();
    recorder.current?.stop();
    setState("stopped");
  }

  function discard() {
    recorder.current = null;
    chunks.current = [];
    segmentsRef.current = [];
    cleanupRecording();
    setAudioUrl("");
    setTranscript("");
    setPreviewUrl("");
    setSeconds(0);
    startedAtRef.current = 0;
    accumulatedMsRef.current = 0;
    setState("idle");
    setError("");
  }

  return (
    <div className="kh-card p-5">
      <div className="mb-4 rounded-lg border border-saffron/25 bg-saffron/10 p-3 text-sm text-ink">
        Please make sure all participants agree before recording this meeting.
      </div>
      {dbUnavailable ? (
        <div className="mb-4 rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm text-ink">
          Database status could not be checked from this browser. You can still record and try saving; the server will confirm when it saves.
        </div>
      ) : null}
      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <label className="mb-4 block max-w-xs space-y-1">
        <span className="text-sm font-semibold text-slate-600">Transcript language</span>
        <select
          className="kh-input"
          value={transcriptionLanguage}
          onChange={(event) => setTranscriptionLanguage(event.target.value as "km" | "en")}
          disabled={state === "recording" || state === "paused" || uploading}
        >
          <option value="km">Khmer</option>
          <option value="en">English</option>
        </select>
      </label>
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
          <form action={createMeeting} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input className="kh-input" name="title" placeholder="ចំណងជើងប្រជុំ" required />
            <input type="hidden" name="audioUrl" value={audioUrl} />
            <input type="hidden" name="transcript" value={transcript} />
            <input type="hidden" name="duration" value={seconds} />
            <button className="kh-button-primary" disabled={uploading || transcribing || !audioUrl}>
              <Save className="h-4 w-4" />
              {uploading ? "កំពុង upload..." : transcribing ? "កំពុងបម្លែងសំឡេង..." : "រក្សាទុកប្រជុំ"}
            </button>
            <button className="kh-button-secondary" onClick={discard} type="button">
              <Trash2 className="h-4 w-4" />
              បោះចោល
            </button>
          </form>
          {audioUrl ? (
            <p className="text-sm text-leaf">
              សំឡេងត្រូវបាន upload រួច។ {transcript ? "Transcript ត្រូវបានបង្កើត ហើយនឹងរក្សាទុកជាមួយ meeting record។" : "បើមិនមាន transcript សូមដាក់ GEMINI_API_KEY ឬបញ្ចូល transcript ដោយដៃក្រោយរក្សាទុក។"}
            </p>
          ) : uploading ? (
            <p className="text-sm text-slate-500">កំពុង upload សំឡេងទៅ local storage...</p>
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
