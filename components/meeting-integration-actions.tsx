"use client";

import { useState } from "react";

export function MeetingIntegrationActions({ meetingId, providers }: { meetingId: string; providers: string[] }) {
  const [channel, setChannel] = useState("");
  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (url: string, extra: object = {}) => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId, ...extra }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Integration failed.");
      setMessage("បានបញ្ចប់ · Done");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Integration failed."); }
    finally { setBusy(false); }
  };
  if (!providers.includes("google") && !providers.includes("slack")) return null;
  return <section className="kh-card space-y-3 p-5"><h2 className="text-lg font-bold">Integrations</h2>
    {providers.includes("google") && <button type="button" disabled={busy} className="kh-button-secondary" onClick={() => send("/api/integrations/google/calendar")}>Add to Google Calendar</button>}
    {providers.includes("slack") && <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className="kh-button-secondary" onClick={async () => { setBusy(true); try { const response = await fetch("/api/integrations/slack/channels"); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not list channels."); setChannels(result.channels); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not list channels."); } finally { setBusy(false); } }}>Choose Slack channel</button>{channels.length > 0 && <select aria-label="Slack channel" value={channel} onChange={(event) => setChannel(event.target.value)} className="rounded border p-2"><option value="">Select channel</option>{channels.map((item) => <option key={item.id} value={item.id}>#{item.name}</option>)}</select>}<button type="button" disabled={busy || !channel} className="kh-button-secondary" onClick={() => send("/api/integrations/slack/share", { channel })}>Share summary to Slack</button></div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
