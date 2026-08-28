"use client";

import { SidebarNav } from "@/components/sidebar-nav";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ShellStatusCard } from "@/components/shell-status-card";
import { LocalizedText } from "@/components/localized-text";
import { Menu } from "lucide-react";
import Link from "next/link";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/92 shadow-sm shadow-slate-200/40 backdrop-blur-xl lg:hidden">
        <details>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 py-3">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-base font-black text-white shadow-sm">K</div>
              <div>
                <p className="font-bold text-ink">KhmerMeet AI</p>
                <p className="text-xs text-slate-500"><LocalizedText k="appSubtitle" /></p>
              </div>
            </Link>
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm">
              <Menu className="h-5 w-5" />
            </span>
          </summary>
          <div className="max-h-[70vh] overflow-y-auto border-t border-slate-200 bg-white/95 px-2 py-3 shadow-xl">
            <SidebarNav />
            <div className="px-2 pt-2">
              <LanguageSwitcher compact />
            </div>
          </div>
        </details>
      </div>

      <aside className="sticky top-0 z-20 hidden bg-ink text-white shadow-2xl shadow-ink/15 lg:flex lg:h-screen lg:w-72 lg:flex-col">
        <div className="flex items-center justify-between px-4 py-5 lg:block lg:px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-white text-lg font-black text-ink shadow-lg shadow-black/20">K</div>
            <div>
              <p className="font-bold text-white">KhmerMeet AI</p>
              <p className="text-xs text-white/55"><LocalizedText k="appSubtitle" /></p>
            </div>
          </Link>
        </div>
        <SidebarNav />
        <div className="px-4 pb-4">
          <LanguageSwitcher compact />
        </div>
        <div className="mt-auto hidden border-t border-white/10 p-4 lg:block">
          <ShellStatusCard />
        </div>
      </aside>
      <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
