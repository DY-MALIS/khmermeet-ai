type ApiPayload = Record<string, unknown> & {
  error?: string;
  hint?: string;
};

function cleanResponseText(text: string) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export async function readJsonResponse<T extends ApiPayload = ApiPayload>(response: Response): Promise<T> {
  const rawText = await response.text().catch(() => "");
  if (!rawText.trim()) return {} as T;

  try {
    return JSON.parse(rawText) as T;
  } catch {
    const cleaned = cleanResponseText(rawText);
    return {
      error: cleaned || `Server returned ${response.status || "an"} invalid response. Please try again.`
    } as T;
  }
}
