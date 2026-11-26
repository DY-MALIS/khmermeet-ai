"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDisplayLanguage } from "@/lib/display-language";

export function TelegramRemindersPanel({ connected, lastError }: { connected: boolean; lastError: string | null }) {
  const router = useRouter();
  const [language] = useDisplayLanguage();
  const t = (km: string, en: string) => language === "km" ? km : en;
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/telegram/link", { method: "POST" });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Could not create Telegram link.");
      setLink(body.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create Telegram link.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/telegram/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Could not disconnect Telegram.");
      setLink("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Telegram.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-slate-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Telegram</p>
          <p className="text-xs text-slate-500">{connected
            ? t("បានភ្ជាប់។ រំលឹកកិច្ចការដល់កំណត់នៅម៉ោង ៩ ព្រឹក (ម៉ោងកម្ពុជា)។", "Connected. Due-task reminders run at 9 AM Cambodia time.")
            : t("ភ្ជាប់ bot ដើម្បីទទួលការរំលឹកកិច្ចការដល់កំណត់។", "Connect the bot to receive due-task reminders.")}</p>
        </div>
        {connected ? (
          <button className="kh-button-secondary" type="button" disabled={busy} onClick={() => void disconnect()}>{t("ផ្ដាច់", "Disconnect")}</button>
        ) : (
          <button className="kh-button-secondary" type="button" disabled={busy} onClick={() => void connect()}>{t("ភ្ជាប់", "Connect")}</button>
        )}
      </div>
      {link && !connected ? <p className="mt-3 text-sm"><a className="text-leaf underline" href={link} target="_blank" rel="noreferrer">{t("បើក Telegram bot", "Open Telegram bot")}</a> · <button type="button" className="text-leaf underline" onClick={() => router.refresh()}>{t("ពិនិត្យស្ថានភាពម្ដងទៀត", "Refresh status")}</button></p> : null}
      {lastError ? <p className="mt-2 text-xs text-red-700">{t("ការផ្ញើចុងក្រោយបរាជ័យ៖ ", "Last delivery failed: ")}{lastError}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
