"use client";

import { signOut, useSession } from "next-auth/react";
import { useDisplayLanguage } from "@/lib/display-language";

export function ShellStatusCard() {
  const [language] = useDisplayLanguage();
  const { data: session } = useSession();

  return (
    <div className="mb-3 rounded-lg bg-slate-50 p-3">
      <p className="truncate text-sm font-semibold text-ink">{session?.user?.name || session?.user?.email || "..."}</p>
      <p className="truncate text-xs text-slate-500">{session?.user?.email}</p>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/login" })}
        className="mt-2 text-xs font-semibold text-leaf hover:underline"
      >
        {language === "en" ? "Sign out" : "ចាកចេញ"}
      </button>
    </div>
  );
}
