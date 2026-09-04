import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeTranscriptionLanguageMode } from "@/lib/storage";
import { clampMeetingDurationMs } from "@/lib/meeting-duration";
import { getOptionalUser, isAdminEmail } from "@/lib/session";
import { verifyInviteToken } from "@/lib/livekit-invite";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

function isRecentLiveMeeting(meeting: { status: string; createdAt: Date } | null) {
  if (!meeting) return false;
  if (!["recording", "recorded", "transcribed"].includes(meeting.status)) return false;
  return Date.now() - meeting.createdAt.getTime() < 6 * 60 * 60 * 1000;
}

// Client-mesh per-speaker recording: each participant's own browser
// records only its own microphone as one continuous file for the whole
// call (no restarts - explicit user request, see livekit-call-room.tsx),
// then uploads it directly to Supabase Storage (bypassing this server
// entirely for the actual bytes - see lib/client/direct-upload.ts) and
// calls this route just to register that upload against the meeting. No
// AI call happens here; transcription is a separate, later step
// (transcribe-stored-segment). Same permissive ownership model as the
// rest of this recording flow - any participant handed this live meetingId
// can register their own recording, including no-email guests.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const user = await getOptionalUser();

    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting || !isRecentLiveMeeting(meeting)) {
      return NextResponse.json({ error: "No live recording found for this meeting." }, { status: 404 });
    }
    const hasOwnerAccess = Boolean(user) && (meeting.createdById === user?.id || isAdminEmail(user?.email));
    if (!hasOwnerAccess && !verifyInviteToken(body.room, body.inviteToken)) {
      return NextResponse.json({ error: "Invite link is required to register this recording." }, { status: 401 });
    }

    const speakerIdentity = String(body.speakerIdentity ?? "").trim();
    const speakerName = String(body.speakerName ?? "").trim();
    const audioUrl = String(body.audioUrl ?? "").trim();
    const durationMs = clampMeetingDurationMs(body.durationMs);
    if (!speakerIdentity || !audioUrl) {
      return NextResponse.json({ error: "speakerIdentity, audioUrl, and durationMs are required." }, { status: 400 });
    }
    const languageMode = normalizeTranscriptionLanguageMode(body.languageMode);
    const displayName = speakerName || speakerIdentity;
    const speakerNames = Array.from(new Set([...(meeting.speakerNames ?? []), displayName].map((name) => name.trim()).filter(Boolean)));

    // Idempotent: a retry from the same participant replaces their prior
    // (possibly partial/failed) registration instead of creating a
    // duplicate that would double their text up in the merged transcript.
    await prisma.meetingTranscriptSegment.deleteMany({
      where: { meetingId: id, speakerIdentity, segmentIndex: 1 }
    });
    await prisma.meetingTranscriptSegment.create({
      data: {
        meetingId: id,
        speakerIdentity,
        speakerName: displayName,
        segmentIndex: 1,
        startMs: 0,
        endMs: Math.round(durationMs),
        text: "",
        audioUrl,
        languageMode
      }
    });
    await prisma.meeting.update({
      where: { id },
      data: { speakerNames }
    });

    return NextResponse.json({ registered: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not register the recording." },
      { status: 500 }
    );
  }
}
