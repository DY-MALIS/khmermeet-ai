"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Provider = "google" | "slack" | "zoom";
const names: Record<Provider, string> = { google: "Google Calendar", slack: "Slack", zoom: "Zoom" };

export function IntegrationsPanel({ connected, configured }: { connected: Provider[]; configured: Provider[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [recordings, setRecordings] = useState<Array<{ uuid: string; topic: string; startTime: string }>>([]);
  const run = async (label: string, url: string, body?: object) => {
    setBusy(label); setError("");
    try {
      const response = await fetch(url, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Request failed.");
      router.refresh();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally { setBusy(""); }
  };
  return <div className="space-y-3">
    {(["google", "slack", "zoom"] as Provider[]).map((provider) => <div key={provider} className="flex items-center justify-between rounded-lg border border-slate-100 p-4">
      <span className="font-semibold">{names[provider]}</span>
      {connected.includes(provider) ? <button type="button" disabled={Boolean(busy)} className="kh-button-secondary" onClick={() => run(provider, `/api/integrations/${provider}/disconnect`, {})}>ផ្ដាច់ · Disconnect</button>
        : configured.includes(provider) ? <a className="kh-button-secondary" href={`/api/integrations/${provider}/connect`}>ភ្ជាប់ · Connect</a>
          : <span className="text-sm text-slate-500">ត្រូវរៀបចំ OAuth · Admin setup required</span>}
    </div>)}
    {connected.includes("zoom") && <div className="rounded-lg border p-4">
      <button type="button" disabled={Boolean(busy)} className="kh-button-secondary" onClick={async () => { const result = await run("zoom-recordings", "/api/integrations/zoom/recordings"); if (result?.meetings) setRecordings(result.meetings); }}>បង្ហាញ Zoom transcripts · List transcripts</button>
      <div className="mt-3 space-y-2">{recordings.map((recording) => <div key={recording.uuid} className="flex items-center justify-between gap-3 text-sm"><span>{recording.topic} · {recording.startTime}</span><button type="button" disabled={Boolean(busy)} className="kh-button-secondary" onClick={async () => { const result = await run("zoom-import", "/api/integrations/zoom/recordings", { uuid: recording.uuid }); if (result?.meetingId) router.push(`/meetings/${result.meetingId}`); }}>Import</button></div>)}</div>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
