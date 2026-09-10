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
          await createSupabaseBrowserClient().auth.signOut();
          window.location.href = "/login";
        }}
        className="mt-2 text-xs font-semibold text-leaf hover:underline"
      >
        Sign out
      </button>
    </div>
  );
}
