import { PlugZap } from "lucide-react";
import { requireUser } from "@/lib/session";

const integrations = [
  "Google Calendar",
  "Telegram",
  "Slack",
  "Zoom"
];

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">គណនី និងភាសា</p>
        <h1 className="text-3xl font-bold text-ink">ការកំណត់</h1>
      </div>
      <section className="kh-card p-5">
        <h2 className="mb-4 text-lg font-bold">Display language</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-lg border border-leaf bg-leaf/5 p-4">
            <input className="mr-2" type="radio" name="language" defaultChecked /> Khmer
          </label>
          <label className="rounded-lg border border-slate-200 p-4">
            <input className="mr-2" type="radio" name="language" /> English
          </label>
        </div>
      </section>
      <section className="kh-card p-5">
        <h2 className="mb-4 text-lg font-bold">Account info</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><p className="text-sm text-slate-500">Name</p><p className="font-semibold">{user.name}</p></div>
          <div><p className="text-sm text-slate-500">Email</p><p className="font-semibold">{user.email}</p></div>
        </div>
      </section>
      <section className="kh-card p-5">
        <h2 className="mb-4 text-lg font-bold">Integrations</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {integrations.map((item) => (
            <div key={item} className="flex items-center justify-between rounded-lg border border-slate-100 p-4">
              <span className="flex items-center gap-3 font-semibold"><PlugZap className="h-4 w-4 text-saffron" />{item}</span>
              <span className="kh-badge bg-slate-100 text-slate-500">Soon</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">TODO: Google Calendar integration, Telegram reminder, team workspace, payment plan.</p>
      </section>
    </div>
  );
}
