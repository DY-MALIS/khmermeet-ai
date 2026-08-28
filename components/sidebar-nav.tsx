"use client";

import { BarChart3, Bot, CalendarPlus, CheckSquare, FileText, History, Settings, Video } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  | "settings";

const nav: Array<{ href: string; labelKey: NavigationLabelKey; icon: typeof BarChart3 }> = [
  { href: "/dashboard", labelKey: "dashboard", icon: BarChart3 },
  { href: "/meetings/call", labelKey: "meetings", icon: Video },
  { href: "/meetings/new", labelKey: "recorder", icon: CalendarPlus },
  { href: "/transcripts", labelKey: "transcript", icon: FileText },
  { href: "/summaries", labelKey: "aiSummary", icon: Bot },
  { href: "/tasks", labelKey: "tasks", icon: CheckSquare },
  { href: "/meetings", labelKey: "history", icon: History },
  { href: "/settings", labelKey: "settings", icon: Settings }
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [language] = useDisplayLanguage();
  const labels = navigationLabels[language];
  const text = uiText[language];

  function navigate(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (pathname === href) return;
    event.preventDefault();

    const hasActiveCall = sessionStorage.getItem("khmermeet-active-call") === "true";
    if (hasActiveCall) {
      window.alert(text.activeCallWarning);
      return;
    }

    router.push(href);
  }

  return (
    <nav className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4 lg:block lg:space-y-1.5 lg:px-4">
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
            onClick={(event) => navigate(event, item.href)}
            className={cn(
              "group relative flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition lg:gap-3",
              active
                ? "bg-white text-ink shadow-md shadow-black/15"
                : "text-white/65 hover:bg-white/10 hover:text-white"
            )}
            aria-current={active ? "page" : undefined}
          >
            {active ? <span className="absolute left-0 top-2 h-7 w-1 rounded-r-full bg-saffron" /> : null}
            <item.icon className={cn("h-4 w-4", active ? "text-leaf" : "text-white/45 group-hover:text-white")} />
            <span className="leading-5">{labels[item.labelKey]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
