"use client";

import { AlertCircle, CheckCircle2, Loader2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
        body: JSON.stringify({ languageMode, speakerNames })
      });
      const data = await readJsonResponse<{ transcript?: string; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Could not transcribe audio.");
      const nextTranscript = typeof data.transcript === "string" ? data.transcript.trim() : "";
      if (!nextTranscript) {
        throw new Error("Transcription finished, but no speech text was returned. Please try again with clearer audio.");
      }
      onTranscribed?.(nextTranscript);
      setMessage(
        hasTranscript
          ? "Transcript replaced below. Refreshing meeting data..."
          : "Transcription saved below. Refreshing meeting data..."
      );
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
          {hasTranscript ? "ស្តាប់សំឡេងឡើងវិញ (Re-transcribe audio)" : "ថតបំលែងសំឡេងទៅជាអត្ថបទ (Transcribe audio)"}
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {hasTranscript
            ? "AI នឹងស្តាប់ឯកសារសំឡេងដែលបានរក្សាទុកម្តងទៀត ហើយជំនួស transcript បច្ចុប្បន្នទាំងស្រុង។ ប្រើពេល transcript មានពាក្យខុសពីអ្វីដែលបាននិយាយ។"
            : "ជ្រើសរើសភាសាដែលបាននិយាយ រួច AI នឹងបំលែងឯកសារសំឡេងទៅជាអត្ថបទ meeting។"}
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="kh-input max-w-xs"
          value={languageMode}
          onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}
          disabled={pending}
        >
          <option value="km">លទ្ធផលជាភាសាខ្មែរ</option>
          <option value="en">លទ្ធផលជាភាសាអង់គ្លេស</option>
          <option value="km-en">រក្សាទាំងខ្មែរ និងអង់គ្លេស</option>
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
