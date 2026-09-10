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

    // Was summary.slice(0, 12000) applied silently further down: a longer
    // summary lost its tail before translation even started, and the reply
    // gave no hint that had happened. Say so instead of quietly translating
    // part of the document.
    const INPUT_CHAR_LIMIT = 12000;
    if (summary.length > INPUT_CHAR_LIMIT) {
      return NextResponse.json(
        {
          error: `This summary is ${summary.length} characters, longer than the ${INPUT_CHAR_LIMIT} this translator handles in one pass. Please shorten it first, or translate it in sections.`
        },
        { status: 413 }
      );
    }

    if (!summary) return NextResponse.json({ error: "Summary is required." }, { status: 400 });
    if (!target) return NextResponse.json({ error: "Target language is required." }, { status: 400 });
    if (!hasOpenRouterKey()) return NextResponse.json({ error: "OPEN_ROUTER_API_KEY is missing." }, { status: 500 });

    const prompt = [
      "Translate the summary below into the requested target language as a professional meeting translator.",
      "Translate the meaning naturally and idiomatically, not word-for-word.",
      "Keep the same names, speaker names, company/product names, dates, times, numbers, URLs, acronyms, bullet structure, and section structure.",
      "Preserve technical terms that are normally used in English unless the target language has a common natural equivalent.",
      "For Khmer output, use natural modern Khmer phrasing and Khmer section headings; do not leave English headings like Summary, Tasks, Decisions, or Next steps unless they are part of a proper name.",
      "If a source sentence is unclear, translate only what is clearly present instead of guessing.",
      "Do not add facts. Do not remove important details. Do not explain the translation.",
      "Return only the translated summary text.",
      "",
      `Target language: ${target}`,
      "",
      "Summary:",
      summary
    ].join("\n");

    let truncated = false;
    const translated = await generateOpenRouterContent([{ text: prompt }], {
      temperature: 0.1,
      timeoutMs: Math.max(10000, Math.min(translateTimeoutMs, 50000)),
      // Khmer script costs roughly one token per character - far more than
      // Latin text - so a flat 2500 was already too small for summaries this
      // app really produces (a 3-minute meeting has produced a 2705-character
      // one), cutting translations off mid-sentence. Size the budget from the
      // actual input, with headroom because a translation can be longer than
      // its source.
      maxTokens: Math.min(16000, Math.max(2500, summary.length * 2 + 1000)),
      onTruncated: () => {
        truncated = true;
      }
    });

    if (!translated.trim()) {
      return NextResponse.json(
        { error: "The AI returned an empty translation. Please try again." },
        { status: 502 }
      );
    }

    // Returned rather than swallowed: a translation that stops mid-sentence
    // still looks like a finished document to someone who can't read the
    // source language, which is exactly who uses this button.
    return NextResponse.json({
      translated,
      ...(truncated
        ? {
            partial: true,
            message:
              "The translation was cut off before the end of the summary. Please try again, or translate it in shorter sections."
          }
        : {})
    });
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
