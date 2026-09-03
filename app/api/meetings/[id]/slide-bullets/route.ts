import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { generateSlideBullets } from "@/lib/ai/openrouter";
import { normalizeTranscriptionLanguageMode } from "@/lib/storage";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-generate");
    if (limited) return limited;
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, ...ownerWhere(user) } });

    if (!meeting) {
      return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    }
    if (!meeting.summary?.trim()) {
      return NextResponse.json({ error: "No summary yet." }, { status: 400 });
    }

    const language = normalizeTranscriptionLanguageMode(meeting.language);
    const slideText = await generateSlideBullets(meeting.summary, language);
    return NextResponse.json({ slideText });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not shorten the summary for slides." },
      { status: 500 }
    );
  }
}
