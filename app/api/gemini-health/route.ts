import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { generateGeminiContent } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const diagnostics = getDiagnostics();
  if (!diagnostics.hasKey) {
    return NextResponse.json(
      {
        ok: false,
        status: "missing_key",
        message: "GEMINI_API_KEY is missing in this deployment.",
        diagnostics
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
      diagnostics,
      sample: text.slice(0, 40)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? sanitizeError(error.message) : "Gemini test failed.",
        diagnostics
      },
      { status: 500 }
    );
  }
}

function getDiagnostics() {
  const key = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, "") ?? "";
  return {
    hasKey: Boolean(key),
    keyFingerprint: key ? createHash("sha256").update(key).digest("hex").slice(0, 10) : null,
    keyLength: key.length || 0,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    environment: process.env.VERCEL_ENV ?? "local"
  };
}

function sanitizeError(message: string) {
  return message
    .replace(/key=AIza[0-9A-Za-z_-]+/g, "key=[hidden]")
    .replace(/AIza[0-9A-Za-z_-]+/g, "[hidden-api-key]")
    .slice(0, 500);
}
