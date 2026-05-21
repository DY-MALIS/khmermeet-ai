import { NextResponse } from "next/server";
import { generateGeminiContent } from "@/lib/ai/gemini";

export const maxDuration = 30;

export async function GET() {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        status: "missing_key",
        message: "GEMINI_API_KEY is missing in this deployment."
      },
      { status: 500 }
    );
  }

  try {
    const text = await generateGeminiContent([{ text: "Reply with only OK." }], {
      temperature: 0
    });
    return NextResponse.json({
      ok: true,
      status: "working",
      message: "Gemini API key is working.",
      sample: text.slice(0, 40)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? sanitizeError(error.message) : "Gemini test failed."
      },
      { status: 500 }
    );
  }
}

function sanitizeError(message: string) {
  return message
    .replace(/key=AIza[0-9A-Za-z_-]+/g, "key=[hidden]")
    .replace(/AIza[0-9A-Za-z_-]+/g, "[hidden-api-key]")
    .slice(0, 500);
}
