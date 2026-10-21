"use client";

import { useCallback, useEffect, useState } from "react";
import type { DisplayLanguage } from "@/lib/navigation-labels";

export const languageStorageKey = "khmermeet-display-language";
export const languageChangeEvent = "khmermeet-language-change";

export function readDisplayLanguage(): DisplayLanguage {
  if (typeof window === "undefined") return "km";
  const language = window.localStorage.getItem(languageStorageKey);
  return language === "en" ? language : "km";
}

export function writeDisplayLanguage(language: DisplayLanguage) {
  window.localStorage.setItem(languageStorageKey, language);
  document.cookie = `${languageStorageKey}=${language}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = language;
  window.dispatchEvent(new CustomEvent<DisplayLanguage>(languageChangeEvent, { detail: language }));
}

export function useDisplayLanguage() {
  const [language, setLanguage] = useState<DisplayLanguage>("km");

  useEffect(() => {
    const syncLanguage = (next = readDisplayLanguage()) => {
      setLanguage(next);
      document.documentElement.lang = next;
    };

    syncLanguage();

    const onLanguageChange = () => {
      syncLanguage(readDisplayLanguage());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === languageStorageKey) syncLanguage();
    };

    window.addEventListener(languageChangeEvent, onLanguageChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(languageChangeEvent, onLanguageChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return [language, writeDisplayLanguage] as const;
}

/** Use for feature copy that has not yet moved into the shared UI dictionary. */
export function useBilingualText() {
  const [language] = useDisplayLanguage();
  return useCallback((khmer: string, english: string) => language === "km" ? khmer : english, [language]);
}
