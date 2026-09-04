"use client";

import { SidebarNav } from "@/components/sidebar-nav";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ShellStatusCard } from "@/components/shell-status-card";
import { LocalizedText } from "@/components/localized-text";
import { Menu } from "lucide-react";
import Link from "next/link";

export function AppShell({
  children,
  user
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
}) {
  return (
    <div className="min-h-screen lg:flex">
      <div className="sticky top-0 z-30 border-b border-leaf/10 bg-emerald-50/95 shadow-sm shadow-leaf/10 backdrop-blur-2xl lg:hidden">
        <details>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 py-3">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-leaf text-base font-black text-white shadow-sm shadow-leaf/20">K</div>
              <div>
                <p className="font-bold text-ink">KhmerMeet AI</p>
                <p className="text-xs text-slate-500"><LocalizedText k="appSubtitle" /></p>
              </div>
            </Link>
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-leaf/15 bg-white/80 text-leaf shadow-sm">
              <Menu className="h-5 w-5" />
            </span>
          </summary>
          <div className="max-h-[70vh] overflow-y-auto border-t border-leaf/10 bg-emerald-50/95 px-2 py-3 shadow-xl">
            <SidebarNav />
            <div className="px-2 pt-2">
              <LanguageSwitcher compact />
            </div>
          </div>
        </details>
      </div>

      <aside className="sticky top-0 z-20 hidden shrink-0 border-r border-leaf/15 bg-gradient-to-b from-emerald-50 via-teal-50 to-sky-50 text-ink shadow-xl shadow-leaf/10 backdrop-blur-2xl lg:flex lg:h-screen lg:w-80 lg:flex-col">
        <div className="flex items-center justify-between px-4 py-5 lg:block lg:px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-leaf text-lg font-black text-white shadow-lg shadow-leaf/20">K</div>
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
        <div className="mt-auto hidden border-t border-leaf/10 p-4 lg:block">
          <ShellStatusCard user={user} />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto w-full max-w-[88rem]">{children}</div>
      </main>
    </div>
  );
}
