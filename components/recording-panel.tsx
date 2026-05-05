"use client";

import { Pause, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createMeeting } from "@/lib/actions";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function RecordingPanel() {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "MediaRecorder" in window);
  }, []);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  async function start() {
    setError("");
    if (!supported) {
      setError("កម្មវិធីរុករកនេះមិនគាំទ្រ Audio recording ទេ។");
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const media = new MediaRecorder(stream);
    chunks.current = [];
    media.ondataavailable = (event) => chunks.current.push(event.data);
    media.onstop = async () => {
      setUploading(true);
      const blob = new Blob(chunks.current, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", blob, "meeting.webm");
      const response = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await response.json();
      setUploading(false);
      if (response.ok) setAudioUrl(data.audioUrl);
      else setError(data.error ?? "មិនអាចរក្សាទុកសំឡេងបានទេ។");
      stream.getTracks().forEach((track) => track.stop());
    };
    recorder.current = media;
    media.start();
    setSeconds(0);
    setState("recording");
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

  return (
    <div className="kh-card p-5">
      <div className="mb-4 rounded-lg border border-saffron/25 bg-saffron/10 p-3 text-sm text-ink">
        Please make sure all participants agree before recording this meeting.
      </div>
      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">ពេលវេលាថត</p>
          <p className="text-4xl font-bold tabular-nums text-ink">{formatTime(seconds)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state === "idle" || state === "stopped" ? (
            <button className="kh-button-primary" onClick={start} type="button"><Play className="h-4 w-4" />ចាប់ផ្តើមថត</button>
          ) : null}
          {state === "recording" ? <button className="kh-button-secondary" onClick={pause} type="button"><Pause className="h-4 w-4" />ផ្អាក</button> : null}
          {state === "paused" ? <button className="kh-button-secondary" onClick={resume} type="button"><Play className="h-4 w-4" />បន្ត</button> : null}
          {state === "recording" || state === "paused" ? <button className="kh-button-secondary" onClick={stop} type="button"><Square className="h-4 w-4" />បញ្ឈប់</button> : null}
        </div>
      </div>
      {state === "stopped" ? (
        <form action={createMeeting} className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input className="kh-input" name="title" placeholder="ចំណងជើងប្រជុំ" required />
          <input type="hidden" name="audioUrl" value={audioUrl} />
          <input type="hidden" name="duration" value={seconds} />
          <button className="kh-button-primary" disabled={uploading || !audioUrl}>{uploading ? "កំពុងរក្សាទុកសំឡេង..." : "រក្សាទុកប្រជុំ"}</button>
        </form>
      ) : null}
    </div>
  );
}
