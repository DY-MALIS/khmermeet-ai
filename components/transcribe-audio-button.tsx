"use client";

import { AlertCircle, CheckCircle2, Loader2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useUiText } from "@/components/localized-text";
import { readJsonResponse } from "@/lib/read-json-response";

type LanguageMode = "km" | "en" | "km-en";

type TranscribeAudioButtonProps = {
  meetingId: string;
  hasTranscript?: boolean;
  speakerNames?: string[];
  onTranscribed?: (transcript: string) => void;
};

export function TranscribeAudioButton({
  meetingId,
  hasTranscript = false,
  speakerNames = [],
  onTranscribed
}: TranscribeAudioButtonProps) {
  const router = useRouter();
  const text = useUiText();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [speakerNamesInput, setSpeakerNamesInput] = useState(speakerNames.join("\n"));
  // Default to km-en so mixed Khmer/English meetings are captured as spoken
  // instead of English getting silently translated into Khmer under "km" mode.
  const [languageMode, setLanguageMode] = useState<LanguageMode>("km-en");

  useEffect(() => {
    setSpeakerNamesInput(speakerNames.join("\n"));
  }, [speakerNames]);

  async function transcribe() {
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languageMode, speakerNames: parseSpeakerNames(speakerNamesInput) })
      });
      const data = await readJsonResponse<{ transcript?: string; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Could not transcribe audio.");
      const nextTranscript = typeof data.transcript === "string" ? data.transcript.trim() : "";
      if (!nextTranscript) {
        throw new Error(text.transcribeMissingSpeech);
      }
      onTranscribed?.(nextTranscript);
      setMessage(hasTranscript ? text.transcriptReplaced : text.transcriptSaved);
      window.setTimeout(() => router.refresh(), 50);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not transcribe audio.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div>
        <p className="font-semibold text-ink">
          {hasTranscript ? text.reTranscribeAudioTitle : text.transcribeAudioTitle}
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {hasTranscript ? text.reTranscribeAudioDescription : text.transcribeAudioDescription}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Khmer mode outputs Khmer only. English mode outputs English only. Use mixed mode only when you want to keep both Khmer and English as spoken.
        </p>
        {speakerNames.length ? (
          <p className="mt-1 text-xs leading-5 text-leaf">
            Speaker labels: {speakerNames.join(", ")}
          </p>
        ) : null}
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-semibold text-slate-600">{text.speakerNames}</span>
        <textarea
          className="kh-input min-h-20 text-sm"
          value={speakerNamesInput}
          onChange={(event) => setSpeakerNamesInput(event.target.value)}
          placeholder={text.speakerNamesPlaceholder}
          disabled={pending}
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="kh-input max-w-xs"
          value={languageMode}
          onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}
          disabled={pending}
        >
          <option value="km">{text.khmerOutput}</option>
          <option value="en">{text.englishOutput}</option>
          <option value="km-en">{text.mixedOutput}</option>
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

function parseSpeakerNames(value: string) {
  return [
    ...new Set(
      value
        .split(/[,，\n]/)
        .map((name) => name.trim())
        .filter(Boolean)
    )
  ].slice(0, 100);
}
