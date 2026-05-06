"use client";

import { useEffect, useState } from "react";
import type { DisplayLanguage } from "@/lib/navigation-labels";

export const languageStorageKey = "khmermeet-display-language";
export const languageChangeEvent = "khmermeet-language-change";

export function readDisplayLanguage(): DisplayLanguage {
  if (typeof window === "undefined") return "km";
  return window.localStorage.getItem(languageStorageKey) === "en" ? "en" : "km";
}

export function writeDisplayLanguage(language: DisplayLanguage) {
  window.localStorage.setItem(languageStorageKey, language);
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

    const onLanguageChange = (event: Event) => {
      syncLanguage((event as CustomEvent<DisplayLanguage>).detail ?? readDisplayLanguage());
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

