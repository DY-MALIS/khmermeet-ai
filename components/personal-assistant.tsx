"use client";

import { useState } from "react";
import { Loader2, Send, Sparkles, UserRound } from "lucide-react";
import { readJsonResponse } from "@/lib/read-json-response";
import { useBilingualText } from "@/lib/display-language";

export function PersonalAssistant() {
  const t = useBilingualText();
  const suggestions = [
    t("តើខ្ញុំមានកិច្ចការអ្វីខ្លះក្នុងសប្ដាហ៍នេះ?", "What are my tasks this week?"),
    t("តើកិច្ចការណាហួសកំណត់?", "What tasks are overdue?"),
    t("តើខ្ញុំមានកិច្ចប្រជុំអ្វីខ្លះ?", "What meetings do I have?")
  ];
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(nextQuestion = question) {
    const cleanQuestion = nextQuestion.trim();
    if (!cleanQuestion) return;
    setLoading(true);
    setError("");
    setAnswer("");
    try {
      const response = await fetch("/api/assistant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion })
      });
      const data = await readJsonResponse<{ answer?: string; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? t("ជំនួយការមិនដំណើរការ។", "Assistant failed."));
      setAnswer(data.answer ?? "");
    } catch (error) {
      setError(error instanceof Error ? error.message : t("ជំនួយការមិនដំណើរការ។", "Assistant failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="kh-card p-5">
      <p className="mb-3 flex items-center gap-2 text-lg font-bold">
        <UserRound className="h-4 w-4 text-leaf" />
        {t("ជំនួយការផ្ទាល់ខ្លួន AI", "AI Personal Assistant")}
        <Sparkles className="h-3.5 w-3.5 text-leaf" />
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="kh-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void ask();
          }}
          placeholder={t("ឧ. តើខ្ញុំមានកិច្ចការអ្វីខ្លះក្នុងសប្ដាហ៍នេះ?", "e.g. What are my tasks this week?")}
          disabled={loading}
        />
        <button className="kh-button-primary shrink-0" type="button" onClick={() => void ask()} disabled={loading || !question.trim()} aria-label={t("សួរជំនួយការ", "Ask assistant")}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="rounded-full border border-leaf/15 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-leaf/10 hover:text-leaf disabled:opacity-50"
            disabled={loading}
            onClick={() => {
              setQuestion(suggestion);
              void ask(suggestion);
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>
      {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
      {answer ? <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-ink">{answer}</pre> : null}
    </section>
  );
}
