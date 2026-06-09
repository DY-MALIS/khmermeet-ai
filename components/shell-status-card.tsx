"use client";

import { useDisplayLanguage } from "@/lib/display-language";

export function ShellStatusCard() {
  const [language] = useDisplayLanguage();

  return (
    <div className="mb-3 rounded-lg bg-slate-50 p-3">
      <p className="text-sm font-semibold text-ink">{language === "en" ? "No-login MVP" : "MVP មិនបាច់ login"}</p>
      <p className="truncate text-xs text-slate-500">{language === "en" ? "Local dashboard mode" : "របៀបផ្ទាំងគ្រប់គ្រង local"}</p>
    </div>
  );
}
