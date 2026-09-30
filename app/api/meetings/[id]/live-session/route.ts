import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { buildLiveSetup, createLiveToken, geminiApiKey } from "@/lib/ai/gemini-live";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Starts a realtime Gemini Live conversation about one meeting: returns a
// single-use token plus the setup the browser sends when it connects. 503
// tells the page to fall back to the older /live-answer conversation.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!geminiApiKey()) return NextResponse.json({ error: "Realtime voice is not configured." }, { status: 503 });
    const { id } = await params;
    const [limited, meeting, body] = await Promise.all([
      rateLimitResponse(user.id, "ai-generate"),
      prisma.meeting.findFirst({ where: { id, ...ownerWhere(user) }, select: { transcript: true } }),
      request.json().catch(() => ({}))
    ]);
    if (limited) return limited;
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    if (!meeting.transcript?.trim() || !hasUsableTranscript(meeting.transcript)) {
      return NextResponse.json({ error: "Transcript has no clear speech text yet." }, { status: 400 });
    }
    const voice = body?.voice === "male" ? "male" : "female";
    const { token, wsUrl } = await createLiveToken();
    return NextResponse.json(
      { token, wsUrl, setup: buildLiveSetup(meeting.transcript, voice) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.warn("Live session could not start:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Realtime voice is unavailable right now." }, { status: 503 });
  }
}
