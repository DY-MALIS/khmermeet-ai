"use client";

import { Languages } from "lucide-react";
import { cn } from "@/components/ui";
import { languageStorageKey, readDisplayLanguage, useDisplayLanguage } from "@/lib/display-language";
import { languageNames, navigationLabels, type DisplayLanguage } from "@/lib/navigation-labels";

export { languageStorageKey, readDisplayLanguage };

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const [language, setLanguage] = useDisplayLanguage();
  const labels = navigationLabels[language];

  function changeLanguage(next: DisplayLanguage) {
    setLanguage(next);
  }

  return (
    <div className={cn("rounded-lg border border-slate-200 bg-white p-3", compact && "p-2")}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Languages className="h-4 w-4" />
        {labels.language}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["km", "en"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => changeLanguage(item)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-semibold transition",
              language === item ? "bg-leaf text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
            )}
          >
            {languageNames[item]}
          </button>
        ))}
      </div>
    </div>
  );
}
