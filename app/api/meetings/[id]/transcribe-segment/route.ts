import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getEgressSegmentDurationSeconds } from "@/lib/livekit-egress";
import { downloadSupabaseAudio, normalizeTranscriptionLanguageMode, transcribeAudio } from "@/lib/storage";
import { hasUsableTranscript } from "@/lib/transcript-quality";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const meeting = await prisma.meeting.findFirst({ where: { id, createdById: user.id } });

    if (!meeting) {
      return NextResponse.json({ error: "No meeting found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const objectPath = typeof body.objectPath === "string" ? body.objectPath.trim() : "";
    if (!objectPath.startsWith("livekit-egress/") || objectPath.includes("..")) {
      return NextResponse.json({ error: "Invalid segment path." }, { status: 400 });
    }
    const index = Number(body.index ?? 0);
    const languageMode = normalizeTranscriptionLanguageMode(body.languageMode);
    const speakerIdentity = typeof body.speakerIdentity === "string" ? body.speakerIdentity.trim() : "";
    const speakerName = typeof body.speakerName === "string" ? body.speakerName.trim() : "";
    const startOffsetMs = Number(body.startOffsetMs);
    if (!speakerIdentity || !Number.isFinite(startOffsetMs)) {
      return NextResponse.json({ error: "speakerIdentity and startOffsetMs are required." }, { status: 400 });
    }

    const { data, mimeType } = await downloadSupabaseAudio(objectPath);
    const file = new File([data], path.basename(objectPath), { type: mimeType });

    // No speakerNames passed here: this track is already single-speaker audio,
    // so the speaker label is attached externally (below) instead of asking
    // the model to guess/label speakers within the transcribed text itself.
    const transcript = await transcribeAudio(file, [], languageMode, {
      mode: "live",
      timeoutMs: 45000
    });

    if (!hasUsableTranscript(transcript)) {
      return NextResponse.json({ transcript: "", skipped: true, index });
    }

    const segmentDurationMs = getEgressSegmentDurationSeconds() * 1000;
    const startMs = startOffsetMs + (index - 1) * segmentDurationMs;
    const endMs = startMs + segmentDurationMs;

    await prisma.meetingTranscriptSegment.create({
      data: {
        meetingId: id,
        speakerIdentity,
        speakerName: speakerName || speakerIdentity,
        segmentIndex: index,
        startMs,
        endMs,
        text: transcript.trim()
      }
    });

    return NextResponse.json({ transcript, index });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? sanitizeError(error.message) : "Could not transcribe audio segment." },
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
