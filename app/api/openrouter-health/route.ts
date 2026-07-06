import { createHash } from "crypto";
import { NextResponse } from "next/server";
import {
  generateOpenRouterContent,
  OpenRouterApiError,
  textModel,
  transcriptionModel
} from "@/lib/ai/openrouter";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const diagnostics = getDiagnostics();
  if (!diagnostics.hasKey) {
    return NextResponse.json(
      { ok: false, status: "missing_key", message: "OPEN_ROUTER_API_KEY is missing in this deployment.", diagnostics },
      { status: 500 }
    );
  }

  try {
    const sample = await generateOpenRouterContent([{ text: "Reply with only OK." }], { temperature: 0 });
    return NextResponse.json({
      ok: true,
      status: "working",
      message: "OpenRouter API key is working.",
      diagnostics,
      sample: sample.slice(0, 40)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "OpenRouter API check failed.",
        diagnostics,
        openRouterError: getSafeError(error)
      },
      { status: 500 }
    );
  }
}

function getDiagnostics() {
  const key = (process.env.OPEN_ROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY)?.trim().replace(/^["']|["']$/g, "") ?? "";
  return {
    hasKey: Boolean(key),
    keyFingerprint: key ? createHash("sha256").update(key).digest("hex").slice(0, 10) : null,
    keyEnding: key ? `...${key.slice(-4)}` : null,
    keyLength: key.length || 0,
    textModel: textModel(),
    transcriptionModel: transcriptionModel(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    environment: process.env.VERCEL_ENV ?? "local"
  };
}

function getSafeError(error: unknown) {
  if (!(error instanceof OpenRouterApiError)) return null;
  return {
    httpStatus: error.status,
    providerStatus: error.providerStatus ?? null,
    safeDetail: error.safeDetail
  };
}
