import { BarChart3, CalendarPlus, CheckSquare, History, Settings } from "lucide-react";
import { labels } from "@/lib/labels";

const nav = [
  { href: "/dashboard", label: labels.km.dashboard, icon: BarChart3 },
  { href: "/meetings/new", label: labels.km.newMeeting, icon: CalendarPlus },
  { href: "/meetings", label: labels.km.meetings, icon: History },
  { href: "/tasks", label: labels.km.tasks, icon: CheckSquare },
  { href: "/settings", label: labels.km.settings, icon: Settings }
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-6">
          <a href="/dashboard" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-leaf text-lg font-black text-white">K</div>
            <div>
              <p className="font-bold text-ink">KhmerMeet AI</p>
              <p className="text-xs text-slate-500">AI meeting tracker</p>
            </div>
          </a>
        </div>
        <nav className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-5 lg:block lg:space-y-2 lg:px-4">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-ink lg:gap-3"
            >
              <item.icon className="h-4 w-4" />
              <span className="leading-5">{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-slate-200 p-4 lg:block">
          <div className="mb-3 rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-semibold text-ink">No-login MVP</p>
            <p className="truncate text-xs text-slate-500">Local dashboard mode</p>
          </div>
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
