"use client";

import { Copy, Languages, Loader2, Save, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/components/ui";

type TargetLanguage = "km" | "en";

export function TranscriptTranslationAgent({ meetingId, hasTranscript }: { meetingId: string; hasTranscript: boolean }) {
  const router = useRouter();
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>("km");
  const [translatedText, setTranslatedText] = useState("");
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not translate transcript.");
      setTranslatedText(typeof data.translatedText === "string" ? data.translatedText : "");
      setMessage(nextTarget === "km" ? "បានបកប្រែទៅខ្មែរសុទ្ធ។" : "Translated to English only.");
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save translated transcript.");
      setMessage("បានរក្សាទុកលទ្ធផលបកប្រែជា transcript ថ្មី។ Summary និង tasks នឹងត្រូវបង្កើតឡើងវិញពី transcript ថ្មី។");
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
    <div className="space-y-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-leaf">
            <Languages className="h-4 w-4" />
            Translation Agent
          </p>
          <h3 className="mt-1 text-lg font-bold text-ink">បកប្រែ និងបម្លែង transcript</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            ទាញយក transcript ពីការប្រជុំ ហើយបម្លែងអត្ថបទខ្មែរ/English លាយគ្នាទៅជាខ្មែរសុទ្ធ ឬ English only។
          </p>
        </div>
        <span className={cn("kh-badge", hasTranscript ? "bg-leaf/10 text-leaf" : "bg-saffron/15 text-saffron")}>
          {hasTranscript ? "Transcript ready" : "Need transcript"}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
        <select
          className="kh-input"
          value={targetLanguage}
          onChange={(event) => setTargetLanguage(event.target.value as TargetLanguage)}
          disabled={!hasTranscript || pending || saving}
        >
          <option value="km">បម្លែងទៅខ្មែរសុទ្ធ</option>
          <option value="en">Convert to English only</option>
        </select>
        <button className="kh-button-primary" type="button" disabled={!hasTranscript || pending || saving} onClick={() => translate()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          បកប្រែ transcript
        </button>
        <button className="kh-button-secondary" type="button" disabled={!hasTranscript || pending || saving} onClick={() => translate(targetLanguage === "km" ? "en" : "km")}>
          <Languages className="h-4 w-4" />
          ប្ដូរទៅភាសាផ្សេង
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="kh-button-secondary" type="button" disabled={!hasTranscript || pending || saving} onClick={() => translate("km")}>
          ខ្មែរសុទ្ធ
        </button>
        <button className="kh-button-secondary" type="button" disabled={!hasTranscript || pending || saving} onClick={() => translate("en")}>
          English only
        </button>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">{message}</p> : null}

      {translatedText ? (
        <div className="space-y-3">
          <textarea className="kh-input min-h-56" value={translatedText} onChange={(event) => setTranslatedText(event.target.value)} />
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
      ) : (
        <div className="rounded-lg border border-white bg-white/80 p-4 text-center text-sm text-slate-500">
          {hasTranscript ? "ជ្រើសភាសា រួចចុចបកប្រែ ដើម្បីបង្ហាញលទ្ធផលនៅទីនេះ។" : "ត្រូវមាន transcript ជាមុនសិន ទើប Translation Agent អាចបកប្រែបាន។"}
        </div>
      )}
    </div>
  );
}
