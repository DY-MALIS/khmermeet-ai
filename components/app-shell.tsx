import Link from "next/link";
import { getServerSession } from "next-auth";
import { BarChart3, CalendarPlus, CheckSquare, History, LogOut, Settings } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { labels } from "@/lib/labels";
import { LogoutButton } from "@/components/logout-button";

const nav = [
  { href: "/dashboard", label: labels.km.dashboard, icon: BarChart3 },
  { href: "/meetings/new", label: labels.km.newMeeting, icon: CalendarPlus },
  { href: "/meetings", label: labels.km.meetings, icon: History },
  { href: "/tasks", label: labels.km.tasks, icon: CheckSquare },
  { href: "/settings", label: labels.km.settings, icon: Settings }
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-leaf text-lg font-black text-white">K</div>
            <div>
              <p className="font-bold text-ink">KhmerMeet AI</p>
              <p className="text-xs text-slate-500">AI meeting tracker</p>
            </div>
          </Link>
          <div className="lg:hidden">
            <LogoutButton compact />
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-2 lg:px-4">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-ink"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-slate-200 p-4 lg:block">
          <div className="mb-3 rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-semibold text-ink">{session?.user?.name}</p>
            <p className="truncate text-xs text-slate-500">{session?.user?.email}</p>
          </div>
          <LogoutButton icon={<LogOut className="h-4 w-4" />} />
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
