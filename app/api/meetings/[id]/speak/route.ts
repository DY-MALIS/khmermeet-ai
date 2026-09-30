import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { synthesizeSpeech } from "@/lib/ai/openrouter";
import { publicAiTranscriptionError } from "@/lib/api-error-messages";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Reads an Ask Meeting answer aloud. Scoped to a meeting the user owns so the
// endpoint cannot be used as a general-purpose text-to-speech service.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-generate");
    if (limited) return limited;
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, ...ownerWhere(user) }, select: { id: true } });
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
    if (!text) return NextResponse.json({ error: "Text is required." }, { status: 400 });

    const gender = body?.voice === "male" ? "male" : "female";
    const wav = await synthesizeSpeech(text, 50000, gender);
    return new NextResponse(new Uint8Array(wav), {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" }
    });
  } catch (error) {
    const publicError = publicAiTranscriptionError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
