"use client";

import { useState } from "react";
import { Clock, Loader2, PlayCircle } from "lucide-react";
import { readJsonResponse } from "@/lib/read-json-response";
import { seekAudioPlayer } from "@/lib/audio-player";

type TimelineEntry = { label: string; startMs: number };

function formatTimestamp(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function MeetingTimeline({ meetingId, initialTimeline, hasAudio }: { meetingId: string; initialTimeline: TimelineEntry[]; hasAudio: boolean }) {
  const [timeline, setTimeline] = useState(initialTimeline);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/timeline`, { method: "POST" });
      const data = await readJsonResponse<{ timeline?: TimelineEntry[]; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Could not generate timeline.");
      setTimeline(data.timeline ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not generate timeline.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="kh-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-bold">
          <Clock className="h-4 w-4 text-leaf" />
          AI Timeline
        </p>
        <button className="kh-button-secondary" type="button" onClick={() => void generate()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
          {timeline.length ? "Regenerate" : "Generate"}
        </button>
      </div>
      {error ? <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
      {timeline.length ? (
        <ol className="space-y-2">
          {timeline.map((entry, index) => (
            <li key={index} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="kh-badge bg-leaf/10 text-leaf">{formatTimestamp(entry.startMs)}</span>
                <span className="text-sm font-semibold text-ink">{entry.label}</span>
              </div>
              {hasAudio ? (
                <button className="text-slate-400 hover:text-leaf" type="button" onClick={() => seekAudioPlayer(entry.startMs)} title="Jump to this moment">
                  <PlayCircle className="h-5 w-5" />
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-slate-500">
          Only available for Server Rec recordings (per-speaker timestamped segments). Click Generate to detect topic changes.
        </p>
      )}
    </section>
  );
}
