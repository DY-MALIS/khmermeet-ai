"use client";

import { useState } from "react";
import { Loader2, MessageCircleQuestion, PlayCircle, Send } from "lucide-react";
import { readJsonResponse } from "@/lib/read-json-response";
import { seekAudioPlayer } from "@/lib/audio-player";

type Answer = { answer: string; quote: string | null; speakerName: string | null; startMs: number | null };

const suggestedQuestions = ["What are we discussing?", "What decisions were made?", "Who talked about this?"];

export function MeetingAskChat({ meetingId, hasTranscript, hasAudio }: { meetingId: string; hasTranscript: boolean; hasAudio: boolean }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(nextQuestion = question) {
    const cleanQuestion = nextQuestion.trim();
    if (!cleanQuestion || !hasTranscript) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion })
      });
      const data = await readJsonResponse<Answer & { error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Ask Meeting failed.");
      setResult({ answer: data.answer, quote: data.quote ?? null, speakerName: data.speakerName ?? null, startMs: data.startMs ?? null });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Ask Meeting failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="kh-card p-5">
      <p className="mb-3 flex items-center gap-2 text-lg font-bold">
        <MessageCircleQuestion className="h-4 w-4 text-leaf" />
        Ask Meeting
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="kh-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void ask();
          }}
          placeholder={hasTranscript ? "e.g. What decision have we made?" : "Transcript required first"}
          disabled={!hasTranscript || loading}
        />
        <button className="kh-button-primary shrink-0" type="button" onClick={() => void ask()} disabled={!hasTranscript || loading || !question.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestedQuestions.map((suggested) => (
          <button
            key={suggested}
            type="button"
            className="rounded-full border border-leaf/15 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-leaf/10 hover:text-leaf disabled:opacity-50"
            disabled={!hasTranscript || loading}
            onClick={() => {
              setQuestion(suggested);
              void ask(suggested);
            }}
          >
            {suggested}
          </button>
        ))}
      </div>
      {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
      {result ? (
        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          <p className="text-sm leading-6 text-ink">{result.answer}</p>
          {result.quote ? (
            <div className="mt-2 flex items-start justify-between gap-2 rounded-md border border-slate-200 bg-white p-2">
              <p className="text-xs text-slate-500">
                {result.speakerName ? <span className="font-semibold text-slate-700">{result.speakerName}: </span> : null}
                &ldquo;{result.quote}&rdquo;
              </p>
              {hasAudio && result.startMs !== null ? (
                <button
                  className="kh-button-secondary shrink-0"
                  type="button"
                  onClick={() => seekAudioPlayer(result.startMs ?? 0)}
                  title="Jump to this moment in the recording"
                >
                  <PlayCircle className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
