"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { clearSessionBackup } from "@/components/session-keeper";

export function ShellStatusCard({ user }: { user: { name: string; email: string } }) {
  return (
    <div className="mb-3 rounded-lg bg-slate-50 p-3">
      <p className="truncate text-sm font-semibold text-ink">{user.name || user.email}</p>
      <p className="truncate text-xs text-slate-500">{user.email}</p>
      <button
        type="button"
        onClick={async () => {
          // Cleared first: leaving it behind would let SessionKeeper restore
          // the session on the very next page load.
          clearSessionBackup();
          // scope "local" signs out this browser only. Supabase defaults to
          // "global", which revokes every session this account has anywhere -
          // confirmed against auth.sessions here, where one sign-out wiped
          // sessions dating back days. Someone signing out on their computer
          // does not expect to be thrown out on their phone too, and being
          // thrown out unexpectedly is the whole complaint being chased.
          await createSupabaseBrowserClient().auth.signOut({ scope: "local" });
          window.location.href = "/login";
        }}
        className="mt-2 text-xs font-semibold text-leaf hover:underline"
      >
        Sign out
      </button>
    </div>
  );
}
