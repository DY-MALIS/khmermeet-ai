import { createHash } from "crypto";
import { NextResponse } from "next/server";
import {
  generateOpenRouterContent,
  OpenRouterApiError,
  textModel,
  transcribeOpenRouterAudio,
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

  const chat = await checkChatCompletions();
  const transcription = await checkTranscription();

  const ok = chat.ok && transcription.ok;
  return NextResponse.json(
    {
      ok,
      status: ok ? "working" : "failed",
      message: ok
        ? "OpenRouter chat and transcription endpoints are both working."
        : !chat.ok
          ? chat.message
          : transcription.message,
      diagnostics,
      chat,
      transcription
    },
    { status: ok ? 200 : 500 }
  );
}

async function checkChatCompletions() {
  try {
    const sample = await generateOpenRouterContent([{ text: "Reply with only OK." }], { temperature: 0 });
    return { ok: true as const, message: "OpenRouter API key is working.", sample: sample.slice(0, 40) };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "OpenRouter chat completions check failed.",
      openRouterError: getSafeError(error)
    };
  }
}

async function checkTranscription() {
  try {
    await transcribeOpenRouterAudio(buildSilentWav(), "audio/wav", "health-check.wav", "km", 20000);
    return { ok: true as const, message: "OpenRouter transcription endpoint is working." };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "OpenRouter transcription check failed.",
      openRouterError: getSafeError(error)
    };
  }
}

function buildSilentWav(durationMs = 300, sampleRate = 8000) {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function getDiagnostics() {
  const key = (process.env.OPEN_ROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY)?.trim().replace(/^["']|["']$/g, "") ?? "";
  return {
    hasKey: Boolean(key),
    keyFingerprint: key ? createHash("sha256").update(key).digest("hex").slice(0, 10) : null,
    keyEnding: key ? `...${key.slice(-4)}` : null,
    keyLength: key.length || 0,
    textModel: textModel(),
    transcriptionModelKm: transcriptionModel("km"),
    transcriptionModelEn: transcriptionModel("en"),
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
