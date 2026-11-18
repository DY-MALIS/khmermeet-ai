"use client";

import { AudioLines, BarChart3, Bot, CalendarPlus, CheckSquare, FileText, History, Settings, Video } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";
import { useDisplayLanguage } from "@/lib/display-language";
import { navigationLabels } from "@/lib/navigation-labels";
import { uiText } from "@/lib/ui-translations";

type NavigationLabelKey =
  | "dashboard"
  | "meetings"
  | "recorder"
  | "transcript"
  | "aiSummary"
  | "tasks"
  | "history"
  | "voices"
  | "settings";

const nav: Array<{ href: string; labelKey: NavigationLabelKey; icon: typeof BarChart3 }> = [
  { href: "/dashboard", labelKey: "dashboard", icon: BarChart3 },
  { href: "/meetings/call", labelKey: "meetings", icon: Video },
  { href: "/meetings/new", labelKey: "recorder", icon: CalendarPlus },
  { href: "/transcripts", labelKey: "transcript", icon: FileText },
  { href: "/summaries", labelKey: "aiSummary", icon: Bot },
  { href: "/tasks", labelKey: "tasks", icon: CheckSquare },
  { href: "/meetings", labelKey: "history", icon: History },
  { href: "/voices", labelKey: "voices", icon: AudioLines },
  { href: "/settings", labelKey: "settings", icon: Settings }
];

export function SidebarNav() {
  const pathname = usePathname();
  const [language] = useDisplayLanguage();
  const labels = navigationLabels[language];
  const text = uiText[language];

  function guardActiveCall(event: { preventDefault: () => void }, href: string) {
    if (pathname === href) return;
    const hasActiveCall = sessionStorage.getItem("khmermeet-active-call") === "true";
    if (hasActiveCall) {
      event.preventDefault();
      window.alert(text.activeCallWarning);
    }
  }

  return (
    <nav className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4 lg:block lg:space-y-2 lg:px-5">
      {nav.map((item) => {
        const active =
          pathname === item.href ||
          (item.href === "/meetings" &&
            pathname.startsWith("/meetings/") &&
            pathname !== "/meetings/new" &&
            pathname !== "/meetings/call");
        return (
          <Link
            key={item.href}
            href={item.href}
            onNavigate={(event) => guardActiveCall(event, item.href)}
            className={cn(
              "group relative flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition lg:gap-3 lg:px-4",
              active
                ? "bg-[#0b9b78] text-white shadow-lg shadow-black/10"
                : "text-emerald-50/80 hover:bg-white/10 hover:text-white"
            )}
            aria-current={active ? "page" : undefined}
          >
            {active ? <span className="absolute left-0 top-2 h-7 w-1 rounded-r-full bg-[#f5cb3f]" /> : null}
            <item.icon className={cn("h-4 w-4", active ? "text-white" : "text-emerald-100/70 group-hover:text-white")} />
            <span className="min-w-0 truncate leading-5">{labels[item.labelKey]}</span>
            <NavigationPending language={language} />
          </Link>
        );
      })}
    </nav>
  );
}

function NavigationPending({ language }: { language: "km" | "en" }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span role="status" className="ml-auto shrink-0">
      <span className="sr-only">{language === "km" ? "កំពុងបើកទំព័រ" : "Opening page"}</span>
      <span aria-hidden="true" className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
    </span>
  );
}
