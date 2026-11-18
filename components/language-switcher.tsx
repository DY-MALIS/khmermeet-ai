"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/ui";
import { languageStorageKey, readDisplayLanguage, useDisplayLanguage } from "@/lib/display-language";
import { languageNames, navigationLabels, type DisplayLanguage } from "@/lib/navigation-labels";

export { languageStorageKey, readDisplayLanguage };

export function LanguageSwitcher({ compact = false, variant = "default" }: { compact?: boolean; variant?: "default" | "auth" | "loginHero" }) {
  const router = useRouter();
  const [language, setLanguage] = useDisplayLanguage();
  const labels = navigationLabels[language];

  function changeLanguage(next: DisplayLanguage) {
    setLanguage(next);
    router.refresh();
  }

  if (variant === "loginHero") {
    return (
      <div className="grid grid-cols-2 gap-3" aria-label={labels.language}>
        {(["km", "en"] as const).map((item) => (
          <button
            key={item}
            type="button"
            lang={item}
            aria-pressed={language === item}
            onClick={() => changeLanguage(item)}
            className={cn(
              "flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf sm:text-base",
              language === item
                ? "border-[#087862] bg-[#087862] text-white shadow-emerald-900/15"
                : "border-slate-200 bg-white text-[#174d44] hover:border-[#0f8a70] hover:bg-emerald-50"
            )}
          >
            <span aria-hidden="true" className="text-xl">{item === "km" ? "🇰🇭" : "🇺🇸"}</span>
            <span>{item === "km" ? "ខ្មែរ" : "English"}</span>
          </button>
        ))}
      </div>
    );
  }

  if (variant === "auth") {
    return (
      <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1" aria-label={labels.language}>
        {(["km", "en"] as const).map((item) => (
          <button
            key={item}
            type="button"
            lang={item}
            aria-pressed={language === item}
            onClick={() => changeLanguage(item)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf",
              language === item ? "bg-white text-leaf shadow-sm" : "text-slate-500 hover:text-ink"
            )}
          >
            {item === "km" ? "ខ្មែរ" : "EN"}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-slate-200/80 bg-white/90 p-3 shadow-sm", compact && "p-2")}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Languages className="h-4 w-4" />
        {labels.language}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {(["km", "en"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => changeLanguage(item)}
            className={cn(
              "min-w-0 rounded-lg px-2 py-2 text-center text-sm font-bold transition",
              language === item ? "bg-leaf text-white shadow-sm shadow-leaf/20" : "bg-slate-50 text-slate-600 hover:bg-leaf/10 hover:text-leaf"
            )}
          >
            <span className="block truncate">{languageNames[item]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
