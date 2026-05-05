"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function LogoutButton({ compact = false, icon }: { compact?: boolean; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={compact ? "kh-button-secondary px-3" : "kh-button-secondary w-full"}
      title="ចាកចេញ"
    >
      {icon ?? <LogOut className="h-4 w-4" />}
      {!compact ? "ចាកចេញ" : null}
    </button>
  );
}
