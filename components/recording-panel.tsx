"use client";

import { Mic, Pause, Play, RotateCcw, Save, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createMeeting } from "@/lib/actions";

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
  const chunks = useRef<Blob[]>([]);
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dbUnavailable, setDbUnavailable] = useState(false);
  const [error, setError] = useState("");

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
  }, []);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  function getMimeType() {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
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
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const mimeType = getMimeType();
      const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      media.onstop = async () => {
        const blobType = media.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type: blobType });
        const localPreview = URL.createObjectURL(blob);
        previewUrlRef.current = localPreview;
        setPreviewUrl(localPreview);
        setUploading(true);
        const formData = new FormData();
        formData.append("audio", blob, blobType.includes("mp4") ? "meeting.m4a" : "meeting.webm");
        try {
          const response = await fetch("/api/uploads", { method: "POST", body: formData });
          const data = await response.json();
          if (response.ok) {
            setAudioUrl(data.audioUrl);
            setTranscript(typeof data.transcript === "string" ? data.transcript : "");
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
      media.start(1000);
      setSeconds(0);
      setState("recording");
    } catch {
      setError(recordingPermissionHelp());
    }
  }

  function pause() {
    recorder.current?.pause();
    setState("paused");
  }

  function resume() {
    recorder.current?.resume();
    setState("recording");
  }

  function stop() {
    recorder.current?.stop();
    setState("stopped");
  }

  function discard() {
    recorder.current = null;
    chunks.current = [];
    cleanupRecording();
    setAudioUrl("");
    setTranscript("");
    setPreviewUrl("");
    setSeconds(0);
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
          Recording controls can open, but saving a meeting needs the local database. Run Prisma setup first to save records.
        </div>
      ) : null}
      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
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
            <button className="kh-button-primary" disabled={uploading || !audioUrl || dbUnavailable}>
              <Save className="h-4 w-4" />
              {uploading ? "កំពុង upload..." : "រក្សាទុកប្រជុំ"}
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
          <button className="kh-button-secondary" onClick={start} type="button">
            <RotateCcw className="h-4 w-4" />
            ថតម្តងទៀត
          </button>
        </div>
      ) : null}
    </div>
  );
}
