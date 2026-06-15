"use client";

import { CheckCircle2, Copy, Languages, Loader2, Save, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/components/ui";
import { readJsonResponse } from "@/lib/read-json-response";

type TargetLanguage = "km" | "en";

const targetOptions: Array<{ value: TargetLanguage; label: string; helper: string }> = [
  {
    value: "km",
    label: "Khmer",
    helper: "Translate the transcript into Khmer."
  },
  {
    value: "en",
    label: "English",
    helper: "Translate the transcript into English."
  }
];

export function TranscriptTranslationAgent({ meetingId, hasTranscript }: { meetingId: string; hasTranscript: boolean }) {
  const router = useRouter();
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>("km");
  const [translatedText, setTranslatedText] = useState("");
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedTarget = targetOptions.find((option) => option.value === targetLanguage) ?? targetOptions[0];

  async function translate(nextTarget = targetLanguage) {
    setTargetLanguage(nextTarget);
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/translate-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage: nextTarget })
      });
      const data = await readJsonResponse<{ translatedText?: string; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Could not translate transcript.");
      setTranslatedText(typeof data.translatedText === "string" ? data.translatedText : "");
      setMessage(nextTarget === "km" ? "Translated to Khmer." : "Translated to English.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not translate transcript.");
    } finally {
      setPending(false);
    }
  }

  async function saveTranslatedTranscript() {
    if (!translatedText.trim()) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/translate-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage, translatedText, save: true })
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Could not save translated transcript.");
      setMessage("បានរក្សាទុកលទ្ធផលបកប្រែជា transcript ថ្មី។ Summary និង tasks អាចបង្កើតឡើងវិញពី transcript ថ្មីនេះបាន។");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save translated transcript.");
    } finally {
      setSaving(false);
    }
  }

  async function copyResult() {
    if (!translatedText.trim()) return;
    await navigator.clipboard.writeText(translatedText);
    setMessage("បាន copy លទ្ធផលបកប្រែ។");
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-sm font-semibold text-leaf">
            <Languages className="h-4 w-4" />
            Translation Agent
          </p>
          <h3 className="mt-1 text-xl font-bold text-ink">បកប្រែអត្ថបទប្រជុំ</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Translate the meeting transcript into Khmer or English.
          </p>
        </div>
        <span className={cn("kh-badge shrink-0", hasTranscript ? "bg-leaf/10 text-leaf" : "bg-saffron/15 text-saffron")}>
          {hasTranscript ? "Transcript ready" : "Need transcript"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Choose language</span>
          <select
            className="kh-input bg-white"
            value={targetLanguage}
            onChange={(event) => setTargetLanguage(event.target.value as TargetLanguage)}
            disabled={!hasTranscript || pending || saving}
          >
            {targetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs leading-5 text-slate-500">{selectedTarget.helper}</p>
        </label>
        <button className="kh-button-primary h-11 px-5" type="button" disabled={!hasTranscript || pending || saving} onClick={() => translate()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          បកប្រែ transcript
        </button>
      </div>

      {!hasTranscript ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
          <p className="font-semibold text-ink">មិនទាន់មាន transcript សម្រាប់បកប្រែ</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            សូមបញ្ចូល transcript នៅខាងលើ ឬចុច Transcribe audio ជាមុន បន្ទាប់មកត្រឡប់មកប្រើ Translation Agent។
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-leaf/10 p-3 text-sm text-leaf">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {message}
        </p>
      ) : null}

      {translatedText ? (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700">លទ្ធផលបកប្រែ</p>
            <span className="kh-badge bg-sky/10 text-sky">{selectedTarget.label}</span>
          </div>
          <textarea className="kh-input min-h-72 bg-white leading-7" value={translatedText} onChange={(event) => setTranslatedText(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className="kh-button-secondary" type="button" onClick={copyResult} disabled={saving}>
              <Copy className="h-4 w-4" />
              Copy result
            </button>
            <button className="kh-button-primary" type="button" onClick={saveTranslatedTranscript} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              រក្សាទុកជា transcript ថ្មី
            </button>
          </div>
        </div>
      ) : hasTranscript ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
          ជ្រើសភាសា រួចចុច “បកប្រែ transcript” ដើម្បីបង្ហាញលទ្ធផលនៅទីនេះ។
        </div>
      ) : null}
    </div>
  );
}
