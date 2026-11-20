"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, RefreshCw, Trash2, UserRound } from "lucide-react";
import { useUiText } from "@/components/localized-text";

type Person = { name: string; meetings: number; seconds: number };

export function VoiceMemoryList({ people }: { people: Person[] }) {
  const text = useUiText();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanMessage, setScanMessage] = useState("");

  async function scanEarlierCalls() {
    setBusy(true);
    setError("");
    setScanMessage("");
    try {
      const response = await fetch("/api/voices/backfill", { method: "POST" });
      const result = await response.json() as { attempted?: number; learned?: number; error?: string };
      if (!response.ok) throw new Error(result.error || text.voicesScanError);
      setScanMessage(result.learned
        ? text.voicesScanSuccess.replace("{count}", String(result.learned))
        : result.attempted ? text.voicesScanNoMatch : text.voicesScanNone);
      if (result.learned) router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.voicesScanError);
    } finally {
      setBusy(false);
    }
  }

  const scanControls = (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy} onClick={() => void scanEarlierCalls()} className="kh-button kh-button-secondary inline-flex items-center gap-2 disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? text.voicesScanning : text.voicesScan}
      </button>
      {scanMessage && <p role="status" className="text-sm text-slate-600">{scanMessage}</p>}
      {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
    </div>
  );

  async function send(name: string, init: RequestInit) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/voices/${encodeURIComponent(name)}`, init);
      if (!response.ok) throw new Error();
      setEditing(null);
      router.refresh();
    } catch {
      setError(text.voicesError);
    } finally {
      setBusy(false);
    }
  }

  if (!people.length) {
    return <section className="kh-card space-y-4 p-6 text-slate-600"><p>{text.voicesEmpty}</p>{scanControls}</section>;
  }

  return (
    <section className="kh-card divide-y divide-slate-100">
      <div className="p-4">{scanControls}</div>
      {people.map((person) => (
        <div key={person.name} className="flex flex-wrap items-center gap-3 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-leaf">
            <UserRound className="h-5 w-5" />
          </span>
          {editing === person.name ? (
            <form
              className="flex min-w-0 flex-1 flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.trim()) return;
                void send(person.name, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ newName: draft })
                });
              }}
            >
              <input
                autoFocus
                value={draft}
                maxLength={80}
                onChange={(event) => setDraft(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2"
              />
              <button type="submit" disabled={busy || !draft.trim()} className="kh-button kh-button-primary">
                {text.voicesSave}
              </button>
              <button type="button" disabled={busy} onClick={() => setEditing(null)} className="rounded-lg px-3 py-2 text-slate-500">
                {text.voicesCancel}
              </button>
            </form>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{person.name}</p>
                <p className="text-sm text-slate-500">
                  {text.voicesLearnedFrom.replace("{count}", String(person.meetings)).replace("{seconds}", String(person.seconds))}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(person.name);
                  setDraft(person.name);
                }}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <Pencil className="h-4 w-4" />
                {text.voicesRename}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(text.voicesForgetConfirm.replace("{name}", person.name))) void send(person.name, { method: "DELETE" });
                }}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                {text.voicesForget}
              </button>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
