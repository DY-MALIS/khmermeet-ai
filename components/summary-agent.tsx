"use client";

import { useMemo, useState } from "react";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";

type SummaryAgentMeeting = {
  id: string;
  title: string;
  updatedAt: string;
};

export function SummaryAgent({ meetings }: { meetings: SummaryAgentMeeting[] }) {
  const [meetingId, setMeetingId] = useState(meetings[0]?.id ?? "");
  const [command, setCommand] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedMeeting = useMemo(
    () => meetings.find((meeting) => meeting.id === meetingId),
    [meetingId, meetings]
  );

  async function runAgent(nextCommand = command) {
    const cleanCommand = nextCommand.trim();
    if (!meetingId || !cleanCommand) return;

    setLoading(true);
    setError("");
    setAnswer("");
    try {
      const response = await fetch("/api/summary-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, command: cleanCommand })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Summary Agent failed.");
      setAnswer(data.answer ?? "");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Summary Agent មិនអាចដំណើរការ។");
    } finally {
      setLoading(false);
    }
  }

  if (!meetings.length) {
    return (
      <section className="kh-card border-dashed p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf/10 text-leaf">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-bold text-ink">Summary Agent</h2>
            <p className="mt-1 text-sm text-slate-500">
              មិនទាន់មាន meeting summary សម្រាប់ Agent ប្រើទេ។ សូមថតប្រជុំ ឬបញ្ចូល transcript រួច generate summary ជាមុន។
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="kh-card p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-leaf text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-leaf">Summary Agent</p>
            <h2 className="text-xl font-bold text-ink">បញ្ជា Agent សម្រាប់សង្ខេបប្រជុំ</h2>
            <p className="mt-1 text-sm text-slate-500">
              សួរពីសេចក្តីសង្ខេប, សម្រេចចិត្ត, next steps ឬបញ្ជាឲ្យរៀបចំ summary ថ្មី។
            </p>
          </div>
        </div>
        <span className="kh-badge bg-leaf/10 text-leaf">
          <Sparkles className="h-3.5 w-3.5" />
          AI command
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[280px_1fr_auto]">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase text-slate-500">Meeting</span>
          <select className="kh-input" value={meetingId} onChange={(event) => setMeetingId(event.target.value)}>
            {meetings.map((meeting) => (
              <option key={meeting.id} value={meeting.id}>
                {meeting.title}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase text-slate-500">Command</span>
          <input
            className="kh-input"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runAgent();
            }}
            placeholder="ឧទាហរណ៍៖ សូមសង្ខេបសេចក្តីសម្រេចចិត្ត និង next steps"
          />
        </label>
        <button className="kh-button-primary self-end" type="button" onClick={() => void runAgent()} disabled={loading || !command.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          បញ្ជា Agent
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {[
          "សង្ខេបប្រជុំនេះជាខ្មែរ",
          "បង្ហាញសេចក្តីសម្រេចចិត្ត",
          "បង្ហាញ next steps",
          "រៀបចំ action items"
        ].map((quickCommand) => (
          <button
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-leaf/30 hover:bg-leaf/5 hover:text-leaf"
            key={quickCommand}
            type="button"
            onClick={() => {
              setCommand(quickCommand);
              void runAgent(quickCommand);
            }}
            disabled={loading}
          >
            {quickCommand}
          </button>
        ))}
      </div>

      {selectedMeeting ? (
        <p className="mt-3 text-xs text-slate-500">Agent កំពុងប្រើ meeting: {selectedMeeting.title}</p>
      ) : null}
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {answer ? (
        <div className="mt-4 rounded-xl border border-leaf/10 bg-leaf/5 p-4">
          <p className="mb-2 text-sm font-bold text-leaf">Agent answer</p>
          <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{answer}</div>
        </div>
      ) : null}
    </section>
  );
}
