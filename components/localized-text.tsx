"use client";

import { useDisplayLanguage } from "@/lib/display-language";
import { uiText, type UiTextKey } from "@/lib/ui-translations";

export function useUiText() {
  const [language] = useDisplayLanguage();
  return uiText[language];
}

export function LocalizedText({ k }: { k: UiTextKey }) {
  const text = useUiText();
  return <>{text[k]}</>;
}
