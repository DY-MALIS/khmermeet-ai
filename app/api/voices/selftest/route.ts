import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { cosine, voiceprint } from "@/lib/voice/voiceprint";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Confirms the voice model downloads, loads its native runtime and runs on
// this server (it cannot be checked from a developer's machine, which is
// not Linux). Signed-in users only; uses a synthetic tone, no real audio.
export async function GET() {
  await requireUser();
  const started = Date.now();
  try {
    const tone = (pitch: number) =>
      Float32Array.from({ length: 16000 * 12 }, (_, i) => {
        const t = i / 16000;
        return 0.2 * Math.sin(2 * Math.PI * pitch * t) + 0.1 * Math.sin(2 * Math.PI * pitch * 2.03 * t) + 0.05 * Math.sin(2 * Math.PI * pitch * 3.1 * t);
      });
    const a = await voiceprint(tone(120));
    const loadedMs = Date.now() - started;
    const b = await voiceprint(tone(220));
    return NextResponse.json({
      ok: a.length === 256 && Number.isFinite(cosine(a, b)),
      dimensions: a.length,
      firstRunMs: loadedMs,
      secondRunMs: Date.now() - started - loadedMs,
      platform: `${process.platform}/${process.arch}`
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
