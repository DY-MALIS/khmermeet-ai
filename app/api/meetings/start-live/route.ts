import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizeTranscriptionLanguageMode } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Creates a placeholder Meeting row the instant a live-call recording starts,
// before any audio exists yet. Every participant's browser needs this id
// right away (broadcast over the LiveKit data channel) so each can tag its
// own per-speaker recording once the call ends - see
// register-track-recording/route.ts.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Video call meeting";
    const languageMode = normalizeTranscriptionLanguageMode(body.languageMode);
    const speakerNames = normalizeSpeakerNames(body.speakerNames);
    const participantCount = clampParticipantCount(body.participantCount, speakerNames.length);

    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        name: user.name ?? "Local Demo",
        email: user.email ?? "demo@khmermeet.ai",
        passwordHash: "local-no-login"
      }
    });

    const meeting = await prisma.meeting.create({
      data: {
        title,
        language: languageMode,
        status: "recording",
        duration: 0,
        speakerNames,
        smartNote: { participantCount, speakerNameCount: speakerNames.length },
        createdById: user.id
      }
    });

    return NextResponse.json({ meetingId: meeting.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start a live recording." },
      { status: 500 }
    );
  }
}

function normalizeSpeakerNames(value: unknown) {
  const rawNames = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,，\n]/)
      : [];

  return [
    ...new Set(
      rawNames
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter(Boolean)
    )
  ].slice(0, 100);
}

function clampParticipantCount(value: unknown, fallback: number) {
  const count = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  if (!Number.isFinite(count)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(count)));
}
