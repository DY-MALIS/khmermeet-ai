"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, UserRound } from "lucide-react";
import { useUiText } from "@/components/localized-text";

type Person = { name: string; meetings: number; seconds: number };

export function VoiceMemoryList({ people }: { people: Person[] }) {
  const text = useUiText();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    return <section className="kh-card p-6 text-slate-500">{text.voicesEmpty}</section>;
  }

  return (
    <section className="kh-card divide-y divide-slate-100">
      {error && <p className="p-4 text-sm font-semibold text-red-600">{error}</p>}
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
