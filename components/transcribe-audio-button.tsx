"use client";

import { AlertCircle, CheckCircle2, Loader2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonResponse } from "@/lib/read-json-response";

type LanguageMode = "km" | "en" | "km-en";

type TranscribeAudioButtonProps = {
  meetingId: string;
  hasTranscript?: boolean;
  speakerNames?: string[];
  autoStart?: boolean;
  onTranscribed?: (transcript: string) => void;
};

const progressSteps = [
  "កំពុងរៀបចំសំឡេង...",
  "កំពុងស្តាប់សំឡេងជាបំណែកតូចៗ...",
  "កំពុងចាប់ពាក្យ និងឈ្មោះអ្នកនិយាយ...",
  "កំពុងសម្អាតអត្ថបទ និងរក្សាទុក..."
];

export function TranscribeAudioButton({
  meetingId,
  hasTranscript = false,
  speakerNames = [],
  autoStart = false,
  onTranscribed
}: TranscribeAudioButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progressStep, setProgressStep] = useState(0);
  const autoStartedRef = useRef(false);
  // Default to km-en so mixed Khmer/English meetings are captured as spoken
  // instead of English getting silently translated into Khmer under "km" mode.
  const [languageMode, setLanguageMode] = useState<LanguageMode>("km-en");

  const transcribe = useCallback(async () => {
    setPending(true);
    setProgressStep(0);
    setMessage("");
    setError("");
    const progressTimer = window.setInterval(() => {
      setProgressStep((step) => Math.min(step + 1, progressSteps.length - 1));
    }, 14000);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languageMode })
      });
      const data = await readJsonResponse<{ transcript?: string; error?: string; message?: string; partial?: boolean }>(response);
      if (!response.ok) throw new Error(data.error ?? "Could not transcribe audio.");
      const nextTranscript = typeof data.transcript === "string" ? data.transcript.trim() : "";
      if (!nextTranscript) {
        throw new Error("Transcription finished, but no speech text was returned. Please try again with clearer audio.");
      }
      onTranscribed?.(nextTranscript);
      setMessage(
        data.message ??
          (data.partial
            ? "Transcript saved so far. Click Re-transcribe audio again to continue."
            : hasTranscript
              ? "Transcript replaced below. Refreshing meeting data..."
              : "Transcription saved below. Refreshing meeting data...")
      );
      window.setTimeout(() => router.refresh(), 50);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not transcribe audio.";
      setError(
        detail.includes("more time") || detail.toLowerCase().includes("timed out")
          ? `${detail} អត្ថបទដែលចាប់បានមុននេះត្រូវបានរក្សាទុក ប្រសិនបើមាន។ សូមចុចម្តងទៀត ដើម្បីបន្តពីសំឡេងដែលបានរក្សាទុក។`
          : detail
      );
    } finally {
      window.clearInterval(progressTimer);
      setPending(false);
    }
  }, [hasTranscript, languageMode, meetingId, onTranscribed, router]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current || pending || hasTranscript) return;
    autoStartedRef.current = true;
    void transcribe();
  }, [autoStart, hasTranscript, pending, transcribe]);

  return (
    <div className="space-y-3 rounded-2xl border border-leaf/10 bg-gradient-to-br from-white to-emerald-50/50 p-4 shadow-sm">
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
          ជ្រើសរបៀប transcript៖ ខ្មែរ/English បកគ្រប់ពាក្យទៅភាសានោះ។ ខ្មែរ + English រក្សាភាសាតាមដែលនិយាយ។
        </p>
        {speakerNames.length ? (
          <p className="mt-1 text-xs leading-5 text-leaf">
            Speaker labels: {speakerNames.join(", ")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="kh-input w-full sm:max-w-xs"
          value={languageMode}
          onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}
          disabled={pending}
        >
          <option value="km-en">ខ្មែរ + English (រក្សាភាសាដើម)</option>
          <option value="km">ខ្មែរ only (បកទាំងអស់ទៅខ្មែរ)</option>
          <option value="en">English only (translate all to English)</option>
        </select>
        <button className="kh-button-primary sm:w-auto" disabled={pending} onClick={transcribe} type="button">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {pending ? "Transcribing audio..." : hasTranscript ? "Re-transcribe audio" : "Transcribe audio"}
        </button>
      </div>

      {pending ? (
        <div className="rounded-2xl border border-leaf/20 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
            <span>{progressSteps[progressStep]}</span>
            <span>{progressStep + 1}/{progressSteps.length}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-leaf transition-all duration-500"
              style={{ width: `${((progressStep + 1) / progressSteps.length) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            សំឡេងវែងអាចយកពេលច្រើន។ កុំបិទទំព័រនេះ រហូតដល់វារក្សាទុក transcript។
          </p>
        </div>
      ) : null}

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

