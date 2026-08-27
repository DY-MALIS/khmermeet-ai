import { NextResponse } from "next/server";
import { generateOpenRouterContent, hasOpenRouterKey } from "@/lib/ai/openrouter";
import { requireUser } from "@/lib/session";
import { rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 60;
const translateTimeoutMs = Number(process.env.OPEN_ROUTER_TRANSLATE_TIMEOUT_MS ?? 45000);

const targetLabels: Record<string, string> = {
  km: "Khmer",
  en: "English",
  id: "Indonesian",
  th: "Thai",
  zh: "Chinese",
  vi: "Vietnamese"
};

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-generate");
    if (limited) return limited;

    const body = await request.json();
    const summary = typeof body.summary === "string" ? body.summary.trim() : "";
    const targetLanguage = typeof body.targetLanguage === "string" ? body.targetLanguage.trim() : "";
    const customTarget = typeof body.customTarget === "string" ? body.customTarget.trim() : "";
    const target = customTarget || targetLabels[targetLanguage] || targetLanguage;

    if (!summary) return NextResponse.json({ error: "Summary is required." }, { status: 400 });
    if (!target) return NextResponse.json({ error: "Target language is required." }, { status: 400 });
    if (!hasOpenRouterKey()) return NextResponse.json({ error: "OPEN_ROUTER_API_KEY is missing." }, { status: 500 });

    const prompt = [
      "Translate the summary below into the requested target language.",
      "Keep the same meaning, names, dates, numbers, bullet structure, and section structure.",
      "Do not add facts. Do not remove important details. Do not explain the translation.",
      "Return only the translated summary text.",
      "",
      `Target language: ${target}`,
      "",
      "Summary:",
      summary.slice(0, 12000)
    ].join("\n");

    const translated = await generateOpenRouterContent([{ text: prompt }], {
      temperature: 0.1,
      timeoutMs: Math.max(10000, Math.min(translateTimeoutMs, 50000)),
      maxTokens: 2500
    });

    if (!translated.trim()) {
      return NextResponse.json(
        { error: "The AI returned an empty translation. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ translated });
  } catch (error) {
    const message =
      error instanceof Error && error.message.toLowerCase().includes("timed out")
        ? "Translation took too long. Please try again, or shorten the summary before translating."
        : error instanceof Error
          ? error.message
          : "Could not translate summary.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
