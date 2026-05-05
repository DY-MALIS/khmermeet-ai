import { SidebarNav } from "@/components/sidebar-nav";
import { LanguageSwitcher } from "@/components/language-switcher";

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
        <SidebarNav />
        <div className="px-4 pb-4">
          <LanguageSwitcher compact />
        </div>
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
