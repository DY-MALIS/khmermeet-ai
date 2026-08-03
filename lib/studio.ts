export type StudioAction = "clean" | "translate" | "summarize";

type ProcessStudioInput = {
  action: StudioAction;
  text: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  instruction?: string;
};

const actionPrompts: Record<StudioAction, string> = {
  clean:
    "Correct punctuation, obvious recognition mistakes, filler words, and paragraph structure. Preserve every fact and speaker label. Do not invent content.",
  translate:
    "Translate faithfully. Preserve speaker labels, timestamps, names, numbers, and paragraph order. Return only the translated transcript.",
  summarize:
    "Create a concise meeting summary with Overview, Key points, Decisions, Action items, and Next steps. Do not invent information."
};

export async function processStudioText(input: ProcessStudioInput) {
  const text = input.text.trim();
  if (!text) throw new Error("Transcript is empty.");

  const apiKey = (process.env.OPEN_ROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY)?.trim();
  if (!apiKey) {
    if (input.action === "clean") return text.replace(/\n{3,}/g, "\n\n");
    throw new Error("OPEN_ROUTER_API_KEY is missing.");
  }

  const languageInstruction =
    input.action === "translate"
      ? `Translate from ${input.sourceLanguage ?? "auto-detected language"} to ${input.targetLanguage ?? "Khmer"}.`
      : `Write in ${input.targetLanguage ?? "Khmer"}.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      "X-Title": "KhmerMeet AI Scribe Studio"
    },
    body: JSON.stringify({
      model: process.env.OPEN_ROUTER_TEXT_MODEL ?? "openai/gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are a professional bilingual Khmer-English transcript editor. ${actionPrompts[input.action]} ${languageInstruction}`
        },
        {
          role: "user",
          content: `${input.instruction ? `User instruction: ${input.instruction}\n\n` : ""}Transcript:\n${text}`
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI request failed (${response.status}): ${detail.slice(0, 240)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const result = payload.choices?.[0]?.message?.content?.trim();
  if (!result) throw new Error("AI returned an empty result.");
  return result;
}

export function transcriptToSrt(text: string) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines
    .map((line, index) => {
      const start = index * 5;
      const end = start + 5;
      const stamp = (seconds: number) =>
        `00:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")},000`;
      return `${index + 1}\n${stamp(start)} --> ${stamp(end)}\n${line}`;
    })
    .join("\n\n");
}

