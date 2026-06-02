"use client";

import { Loader2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TranscribeAudioButton({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [languageMode, setLanguageMode] = useState<"mixed" | "km" | "en">("mixed");

  async function transcribe() {
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languageMode })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not transcribe audio.");
      setMessage("Transcription saved. Refreshing transcript...");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not transcribe audio.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <select
        className="kh-input max-w-xs"
        value={languageMode}
        onChange={(event) => setLanguageMode(event.target.value as "mixed" | "km" | "en")}
        disabled={pending}
      >
        <option value="mixed">Mixed Khmer / English</option>
        <option value="km">Khmer only</option>
        <option value="en">English only</option>
      </select>
      <button className="kh-button-primary" disabled={pending} onClick={transcribe} type="button">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {pending ? "កំពុងបម្លែងសំឡេង..." : "Transcribe audio"}
      </button>
      {message ? <p className="rounded-lg bg-leaf/10 p-2 text-sm text-leaf">{message}</p> : null}
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
