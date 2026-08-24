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
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <details>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 py-3">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-leaf text-base font-black text-white">K</div>
              <div>
                <p className="font-bold text-ink">KhmerMeet AI</p>
                <p className="text-xs text-slate-500"><LocalizedText k="appSubtitle" /></p>
              </div>
            </Link>
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600">
              <Menu className="h-5 w-5" />
            </span>
          </summary>
          <div className="max-h-[70vh] overflow-y-auto border-t border-slate-200 bg-white px-2 py-3 shadow-xl">
            <SidebarNav />
            <div className="px-2 pt-2">
              <LanguageSwitcher compact />
            </div>
          </div>
        </details>
      </div>

      <aside className="sticky top-0 z-20 hidden border-b border-slate-200 bg-white/90 backdrop-blur lg:flex lg:h-screen lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-leaf text-lg font-black text-white">K</div>
            <div>
              <p className="font-bold text-ink">KhmerMeet AI</p>
              <p className="text-xs text-slate-500"><LocalizedText k="appSubtitle" /></p>
            </div>
          </Link>
        </div>
        <SidebarNav />
        <div className="px-4 pb-4">
          <LanguageSwitcher compact />
        </div>
        <div className="mt-auto hidden border-t border-slate-200 p-4 lg:block">
          <ShellStatusCard />
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
