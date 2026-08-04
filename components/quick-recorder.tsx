"use client";

import { CheckCircle2, Mic, Pause, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { describeMicError } from "@/lib/mic-permission-error";
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

function defaultRecordingTitle() {
  return `ការថតសំឡេង ${new Date().toLocaleString()}`;
}

export function QuickRecorder() {
  const router = useRouter();
  const recorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const [seconds, setSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedRecordingId, setSavedRecordingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "MediaRecorder" in window &&
        Boolean(navigator.mediaDevices?.getUserMedia)
    );
    return () => cleanupRecording();
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
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  async function start() {
    setError("");
    setAudioUrl("");
    setPreviewUrl("");
    setSavedRecordingId("");
    cleanupRecording();
    if (!supported) {
      setError("Browser នេះមិនគាំទ្រ audio recording ទេ។ សូមប្រើ Chrome, Edge, ឬ Firefox ថ្មីៗ។");
      return;
    }
    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      setError("Microphone មិនដំណើរការលើ HTTP LAN link ទេ។ សូមប្រើ localhost លើកុំព្យូទ័រ ឬ deploy/open តាម HTTPS ដូចជា Vercel។");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: clearVoiceAudioConstraints });
      const mimeType = getMimeType();
      const media = new MediaRecorder(stream, getRecorderOptions(mimeType));
      streamRef.current = stream;
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
        setUploading(true);
        const formData = new FormData();
        formData.append("audio", blob, blobType.includes("mp4") ? "recording.m4a" : "recording.webm");
        formData.append("skipTranscription", "true");
        try {
          const response = await fetch("/api/uploads", { method: "POST", body: formData });
          const data = await readJsonResponse<{ audioUrl?: string; error?: string }>(response);
          if (response.ok) {
            if (!data.audioUrl) throw new Error("Audio upload did not return a saved file URL.");
            setAudioUrl(data.audioUrl);
            await saveRecordingAuto(data.audioUrl);
          } else
            setError(
              data.error ??
                (response.status === 413
                  ? "សំឡេងធំពេក មិនអាច upload បានទេ។ សូមថតឱ្យខ្លីជាងនេះ។"
                  : "មិនអាចរក្សាទុកសំឡេងបានទេ។")
            );
        } catch {
          setError("មិនអាច upload សំឡេងបានទេ។ សូមពិនិត្យ server ហើយសាកល្បងម្តងទៀត។");
        } finally {
          setUploading(false);
          stream.getTracks().forEach((track) => track.stop());
        }
      };
      recorder.current = media;
      media.start(5000);
      startedAtRef.current = Date.now();
      accumulatedMsRef.current = 0;
      setSeconds(0);
      setState("recording");
    } catch (error) {
      setError(describeMicError(error));
    }
  }

  async function saveRecordingAuto(savedAudioUrl: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || defaultRecordingTitle(),
          audioUrl: savedAudioUrl,
          duration: seconds
        })
      });
      const data = await readJsonResponse<{ recordingId?: string; error?: string }>(response);
      if (!response.ok || !data.recordingId) throw new Error(data.error ?? "Could not save the recording.");
      setSavedRecordingId(data.recordingId);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "មិនអាចរក្សាទុកសំឡេងបានទេ។ សូមសាកល្បងម្តងទៀត។");
    } finally {
      setSaving(false);
    }
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
      <p className="mb-4 text-sm text-slate-500">
        ថតសំឡេងណាមួយពីខាងក្រៅ (មិនចាំបាច់ជាការប្រជុំ) ដូចជាកំណត់ត្រាសំឡេង គំនិត ឬកិច្ចសម្ភាសន៍ រួចរក្សាទុកបានភ្លាមៗ។
      </p>
      {error ? (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          {!savedRecordingId && audioUrl ? (
            <button
              className="mt-2 font-semibold underline"
              type="button"
              onClick={() => void saveRecordingAuto(audioUrl)}
            >
              សាកល្បងរក្សាទុកម្តងទៀត
            </button>
          ) : null}
        </div>
      ) : null}
      <label className="mb-4 block space-y-1">
        <span className="text-sm font-semibold text-slate-600">ចំណងជើង (ស្រេចចិត្ត)</span>
        <input
          className="kh-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={defaultRecordingTitle()}
          disabled={state === "recording" || state === "paused"}
        />
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
          {uploading ? (
            <p className="text-sm text-slate-500">កំពុង upload សំឡេង...</p>
          ) : saving ? (
            <p className="text-sm text-slate-500">កំពុងរក្សាទុកដោយស្វ័យប្រវត្តិ...</p>
          ) : savedRecordingId ? (
            <p className="flex items-center gap-2 text-sm text-leaf">
              <CheckCircle2 className="h-4 w-4" />
              បានរក្សាទុករួច។ មើលក្នុងបញ្ជីខាងក្រោម។
            </p>
          ) : null}
          <button className="kh-button-secondary" onClick={start} type="button">
            <RotateCcw className="h-4 w-4" />
            ថតម្តងទៀត
          </button>
        </div>
      ) : null}
    </div>
  );
}
