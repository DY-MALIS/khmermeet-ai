"use client";

import { useState } from "react";
import { Copy, Loader2, Mail } from "lucide-react";
import { readJsonResponse } from "@/lib/read-json-response";

export function MeetingFollowUpEmail({ meetingId, hasTranscript }: { meetingId: string; hasTranscript: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/follow-up-email`, { method: "POST" });
      const data = await readJsonResponse<{ email?: string; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Could not generate follow-up email.");
      setEmail(data.email ?? "");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not generate follow-up email.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!email) return;
    await navigator.clipboard.writeText(email);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="kh-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-bold">
          <Mail className="h-4 w-4 text-leaf" />
          Auto Follow-up
        </p>
        <button className="kh-button-primary" type="button" onClick={() => void generate()} disabled={!hasTranscript || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Generate email
        </button>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
      {email ? (
        <div className="rounded-lg border border-slate-100 bg-white p-3">
          <div className="mb-2 flex justify-end">
            <button className="kh-button-secondary" type="button" onClick={() => void copy()}>
              <Copy className="h-4 w-4" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{email}</pre>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Generate a ready-to-send follow-up email summarizing this meeting and its tasks.</p>
      )}
    </section>
  );
}
