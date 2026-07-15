"use client";

import { AlertCircle, CheckCircle2, Loader2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readJsonResponse } from "@/lib/read-json-response";

type LanguageMode = "km" | "en" | "km-en";

type TranscribeAudioButtonProps = {
  meetingId: string;
  hasTranscript?: boolean;
  onTranscribed?: (transcript: string) => void;
};

export function TranscribeAudioButton({ meetingId, hasTranscript = false, onTranscribed }: TranscribeAudioButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [languageMode, setLanguageMode] = useState<LanguageMode>("km");

  async function transcribe() {
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languageMode })
      });
      const data = await readJsonResponse<{ transcript?: string; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Could not transcribe audio.");
      if (typeof data.transcript === "string" && data.transcript.trim()) {
        onTranscribed?.(data.transcript);
      }
      setMessage(hasTranscript ? "Transcript replaced. Refreshing meeting..." : "Transcription saved. Refreshing transcript...");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not transcribe audio.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div>
        <p className="font-semibold text-ink">{hasTranscript ? "Re-transcribe saved audio" : "Transcribe recorded audio"}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {hasTranscript
            ? "Choose the language mode, then let AI replace the current transcript from the saved recording. This also clears the old summary so you can regenerate it from the new text."
            : "Choose the spoken language, then let AI convert the saved recording into meeting text. If OpenRouter access is blocked, the audio stays saved and you can paste the transcript manually."}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Khmer mode outputs Khmer only. English mode outputs English only. Use mixed mode only when you want to keep both Khmer and English as spoken.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="kh-input max-w-xs"
          value={languageMode}
          onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}
          disabled={pending}
        >
          <option value="km">Khmer output</option>
          <option value="en">English output</option>
          <option value="km-en">Keep Khmer + English</option>
        </select>
        <button className="kh-button-primary" disabled={pending} onClick={transcribe} type="button">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {pending ? "Transcribing audio..." : hasTranscript ? "Re-transcribe audio" : "Transcribe audio"}
        </button>
      </div>

      {message ? (
        <p className="flex items-start gap-2 rounded-lg bg-leaf/10 p-3 text-sm leading-6 text-leaf">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
