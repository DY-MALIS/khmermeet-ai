"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/ui";
import { languageStorageKey, readDisplayLanguage, useDisplayLanguage } from "@/lib/display-language";
import { languageNames, navigationLabels, type DisplayLanguage } from "@/lib/navigation-labels";

export { languageStorageKey, readDisplayLanguage };

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [language, setLanguage] = useDisplayLanguage();
  const labels = navigationLabels[language];

  function changeLanguage(next: DisplayLanguage) {
    setLanguage(next);
    router.refresh();
  }

  return (
    <div className={cn("rounded-lg border border-slate-200/80 bg-white/90 p-3 shadow-sm", compact && "p-2")}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Languages className="h-4 w-4" />
        {labels.language}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {(["km", "en", "id"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => changeLanguage(item)}
            className={cn(
              "min-w-0 rounded-lg px-2 py-2 text-center text-xs font-bold transition sm:text-sm",
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
