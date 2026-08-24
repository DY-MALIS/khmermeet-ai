"use client";

import { Languages, Loader2 } from "lucide-react";
import { useState } from "react";
import { useUiText } from "@/components/localized-text";
import { readJsonResponse } from "@/lib/read-json-response";

type TargetLanguage = "en" | "km" | "id" | "th" | "zh" | "vi" | "custom";

export function SummaryTranslator({ summary }: { summary: string }) {
  const text = useUiText();
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>("en");
  const [customTarget, setCustomTarget] = useState("");
  const [translated, setTranslated] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function translate() {
    setLoading(true);
    setError("");
    setTranslated("");
    try {
      const response = await fetch("/api/translate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          targetLanguage,
          customTarget: targetLanguage === "custom" ? customTarget : ""
        })
      });
      const data = await readJsonResponse<{ translated?: string; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? text.summaryTranslateFailed);
      setTranslated(data.translated?.trim() ?? "");
    } catch (error) {
      setError(error instanceof Error ? error.message : text.summaryTranslateFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-leaf/15 bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="summary-translate-target">
          {text.translateSummaryTo}
        </label>
        <select
          id="summary-translate-target"
          className="kh-input h-10 min-w-44 py-1 text-sm"
          value={targetLanguage}
          onChange={(event) => setTargetLanguage(event.target.value as TargetLanguage)}
          disabled={loading}
        >
          <option value="en">{text.englishOutput}</option>
          <option value="km">{text.khmerOutput}</option>
          <option value="id">{text.indonesianOutput}</option>
          <option value="th">{text.thaiOutput}</option>
          <option value="zh">{text.chineseOutput}</option>
          <option value="vi">{text.vietnameseOutput}</option>
          <option value="custom">{text.otherLanguage}</option>
        </select>
        {targetLanguage === "custom" ? (
          <input
            className="kh-input h-10 min-w-48 text-sm"
            value={customTarget}
            onChange={(event) => setCustomTarget(event.target.value)}
            placeholder={text.customLanguagePlaceholder}
            disabled={loading}
          />
        ) : null}
        <button
          className="kh-button-secondary h-10"
          type="button"
          onClick={translate}
          disabled={loading || (targetLanguage === "custom" && !customTarget.trim())}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
          {loading ? text.translatingSummary : text.translateSummary}
        </button>
      </div>
      {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {translated ? (
        <div className="mt-3 rounded-lg bg-slate-50 p-4">
          <p className="mb-2 text-xs font-bold uppercase text-leaf">{text.translatedSummary}</p>
          <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{translated}</div>
        </div>
      ) : null}
    </div>
  );
}
