"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { readJsonResponse } from "@/lib/read-json-response";

export function MeetingSummaryAgent({ meetingId, hasTranscript }: { meetingId: string; hasTranscript: boolean }) {
  const router = useRouter();
  const [command, setCommand] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function runAgent(nextCommand = command) {
    const cleanCommand = nextCommand.trim();
    if (!cleanCommand || !hasTranscript) return;

    setLoading(true);
    setError("");
    setAnswer("");
    try {
      const response = await fetch("/api/summary-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, command: cleanCommand })
      });
      const data = await readJsonResponse<{ answer?: string; updatedSummary?: boolean; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Summary Agent failed.");
      setAnswer(data.answer ?? "");
      if (data.updatedSummary) router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Summary Agent មិនអាចដំណើរការ។");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-leaf/15 bg-leaf/5 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-leaf text-white">
          <Bot className="h-4 w-4" />
        </span>
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-leaf">
            Summary Agent
            <Sparkles className="h-3.5 w-3.5" />
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            បញ្ជាឲ្យ Agent សង្ខេបខ្លី/វែង, ជ្រើសសេចក្តីសម្រេចចិត្ត, next steps, ឬកែសង្ខេបឲ្យអានងាយ។
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="kh-input"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void runAgent();
          }}
          placeholder={hasTranscript ? "ឧទាហរណ៍៖ សង្ខេបឲ្យខ្លី និងបង្ហាញ next steps" : "ត្រូវមាន transcript មុនពេលប្រើ Agent"}
          disabled={!hasTranscript || loading}
        />
        <button className="kh-button-primary shrink-0" type="button" onClick={() => void runAgent()} disabled={!hasTranscript || loading || !command.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          បញ្ជា
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {["សង្ខេបឲ្យខ្លី", "សង្ខេបឲ្យវែងជាងនេះ", "បង្ហាញការសម្រេចចិត្ត", "បង្ហាញ next steps"].map((quickCommand) => (
          <button
            className="rounded-full border border-leaf/15 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-leaf/10 hover:text-leaf disabled:opacity-50"
            disabled={!hasTranscript || loading}
            key={quickCommand}
            type="button"
            onClick={() => {
              setCommand(quickCommand);
              void runAgent(quickCommand);
            }}
          >
            {quickCommand}
          </button>
        ))}
      </div>

      {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
      {answer ? (
        <div className="mt-3 rounded-lg bg-white p-3">
          <p className="mb-2 text-xs font-bold uppercase text-leaf">Agent answer</p>
          <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{answer}</div>
        </div>
      ) : null}
    </div>
  );
}
