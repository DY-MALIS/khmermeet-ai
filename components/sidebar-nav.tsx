"use client";

import { BarChart3, Bot, CalendarPlus, CheckSquare, FileText, History, Settings, Video } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";
import { labels } from "@/lib/labels";

const nav = [
  { href: "/dashboard", label: labels.km.dashboard, icon: BarChart3 },
  { href: "/meetings/new", label: labels.km.newMeeting, icon: CalendarPlus },
  { href: "/meetings/call", label: "វីដេអូខល", icon: Video },
  { href: "/meetings", label: labels.km.meetings, icon: History },
  { href: "/transcripts", label: "អត្ថបទប្រជុំ", icon: FileText },
  { href: "/summaries", label: "សង្ខេបដោយ AI", icon: Bot },
  { href: "/tasks", label: "Action Tracker", icon: CheckSquare },
  { href: "/settings", label: labels.km.settings, icon: Settings }
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-5 lg:block lg:space-y-2 lg:px-4">
      {nav.map((item) => {
        const active =
          pathname === item.href ||
          (item.href === "/meetings" &&
            pathname.startsWith("/meetings/") &&
            pathname !== "/meetings/new" &&
            pathname !== "/meetings/call");
        return (
          <a
            key={item.href}
            href={item.href}
            onClick={(event) => {
              event.preventDefault();
              window.location.assign(item.href);
            }}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition lg:gap-3",
              active ? "bg-leaf/10 text-leaf ring-1 ring-leaf/15" : "text-slate-600 hover:bg-slate-100 hover:text-ink"
            )}
            aria-current={active ? "page" : undefined}
          >
            <item.icon className="h-4 w-4" />
            <span className="leading-5">{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
