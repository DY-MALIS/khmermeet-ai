import { PlugZap } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getServerUiText } from "@/lib/server-ui-text";
import { requireUser } from "@/lib/session";

const integrations = [
  "Google Calendar",
  "Telegram",
  "Slack",
  "Zoom"
];

export default async function SettingsPage() {
  const user = await requireUser();
  const { text } = await getServerUiText();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">{text.accountAndLanguage}</p>
        <h1 className="text-3xl font-bold text-ink">{text.settingsTitle}</h1>
      </div>
      <section className="kh-card p-5">
        <h2 className="mb-4 text-lg font-bold">{text.displayLanguage}</h2>
        <LanguageSwitcher />
        <p className="mt-3 text-sm text-slate-500">
          {text.languageHelp}
        </p>
      </section>
      <section className="kh-card p-5">
        <h2 className="mb-4 text-lg font-bold">{text.accountInfo}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><p className="text-sm text-slate-500">{text.name}</p><p className="font-semibold">{user.name}</p></div>
          <div><p className="text-sm text-slate-500">{text.email}</p><p className="font-semibold">{user.email}</p></div>
        </div>
      </section>
      <section className="kh-card p-5">
        <h2 className="mb-4 text-lg font-bold">{text.integrations}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {integrations.map((item) => (
            <div key={item} className="flex items-center justify-between rounded-lg border border-slate-100 p-4">
              <span className="flex items-center gap-3 font-semibold"><PlugZap className="h-4 w-4 text-saffron" />{item}</span>
              <span className="kh-badge bg-slate-100 text-slate-500">{text.soon}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">{text.integrationsTodo}</p>
      </section>
    </div>
  );
}
