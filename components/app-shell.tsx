"use client";

import { SidebarNav } from "@/components/sidebar-nav";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ShellStatusCard } from "@/components/shell-status-card";
import { BilingualText, LocalizedText } from "@/components/localized-text";
import { SUPPORT_TELEGRAM_URL } from "@/lib/support-contact";
import { Menu, MessageCircle, Video } from "lucide-react";
import Link from "next/link";

export function AppShell({
  children,
  user
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
}) {
  return (
    <div className="min-h-screen bg-[#eff6f2] lg:flex">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#064d43] text-white shadow-lg backdrop-blur-2xl lg:hidden">
        <details>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 py-3">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/30 bg-[#0a9472] text-white shadow-sm"><Video className="h-5 w-5 fill-white" /></div>
              <div>
                <p className="font-bold text-white">KhmerMeet <span className="text-[#f5cb3f]">AI</span></p>
                <p className="text-xs text-emerald-100/70"><LocalizedText k="appSubtitle" /></p>
              </div>
            </Link>
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10 text-white shadow-sm">
              <Menu className="h-5 w-5" />
            </span>
          </summary>
          <div className="max-h-[70vh] overflow-y-auto border-t border-white/10 bg-[#064d43] px-2 py-3 shadow-xl">
            <SidebarNav />
            <div className="px-2 pt-2">
              <LanguageSwitcher compact />
            </div>
          </div>
        </details>
      </div>

      <aside className="sticky top-0 z-20 hidden shrink-0 border-r border-white/10 bg-gradient-to-b from-[#064d43] via-[#07594b] to-[#06473f] text-white shadow-xl shadow-[#073f39]/20 lg:flex lg:h-screen lg:w-72 lg:flex-col">
        <div className="flex items-center justify-between px-4 py-5 lg:block lg:px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-white/30 bg-[#0a9472] text-white shadow-lg shadow-black/10"><Video className="h-6 w-6 fill-white" /></div>
            <div>
              <p className="font-bold text-white">KhmerMeet <span className="text-[#f5cb3f]">AI</span></p>
              <p className="text-xs text-emerald-100/70"><LocalizedText k="appSubtitle" /></p>
            </div>
          </Link>
        </div>
        <SidebarNav />
        <div className="px-4 pb-4">
          <LanguageSwitcher compact />
        </div>
        <div className="mt-auto hidden border-t border-white/10 p-4 lg:block">
          <ShellStatusCard user={user} />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        <div className="mx-auto w-full max-w-[88rem]">{children}</div>
      </main>
      <a href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="fixed bottom-4 right-4 z-40 inline-flex min-h-12 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full bg-[#087862] px-4 py-3 text-sm font-bold text-white shadow-xl shadow-[#073f39]/30 ring-2 ring-white transition hover:bg-[#065d50] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087862]">
        <MessageCircle className="h-5 w-5 shrink-0" />
        <BilingualText km="ជំនួយបង់ប្រាក់ · @malis7171" en="Payment help · @malis7171" />
      </a>
    </div>
  );
}
