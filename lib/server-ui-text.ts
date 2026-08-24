import { cookies } from "next/headers";
import type { DisplayLanguage } from "@/lib/navigation-labels";
import { uiText } from "@/lib/ui-translations";

const languageStorageKey = "khmermeet-display-language";

function normalizeDisplayLanguage(value: string | undefined): DisplayLanguage {
  return value === "en" || value === "id" ? value : "km";
}

export async function getServerUiText() {
  const cookieStore = await cookies();
  const language = normalizeDisplayLanguage(cookieStore.get(languageStorageKey)?.value);
  return { language, text: uiText[language] };
}
