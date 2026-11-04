import { NextResponse } from "next/server";
import { createSupabaseChunkedUploadTicket, createSupabaseUploadTicket, deleteStoredAudio, verifyChunkCleanupToken } from "@/lib/storage";
import { AUDIO_PART_BYTES, MAX_DIRECT_AUDIO_BYTES } from "@/lib/chunked-audio";
import { prisma } from "@/lib/prisma";
import { getOptionalUser, isAdminEmail } from "@/lib/session";
import { verifyMeetingInviteToken } from "@/lib/livekit-invite";
import { isRecentLiveMeeting } from "@/lib/meeting-duration";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

function cleanExtension(value: unknown) {
  const ext = typeof value === "string" ? value.replace(/[^a-z0-9]/gi, "").slice(0, 8) : "";
  return ext || "webm";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const size = typeof body.size === "number" ? body.size : 0;
    if (size && (!Number.isSafeInteger(size) || size < 0 || size > MAX_DIRECT_AUDIO_BYTES)) {
      return NextResponse.json({ error: "The maximum recording size is 300 MiB." }, { status: 413 });
    }
    const meetingId = typeof body.meetingId === "string" ? body.meetingId.trim() : "";
    const user = await getOptionalUser();
    if (meetingId) {
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: { status: true, createdAt: true, createdById: true, smartNote: true }
      });
      if (!meeting || !isRecentLiveMeeting(meeting)) {
        return NextResponse.json({ error: "No live recording found for this upload." }, { status: 404 });
      }
      const hasOwnerAccess = Boolean(user) && (meeting.createdById === user?.id || isAdminEmail(user?.email));
      if (!hasOwnerAccess && !verifyMeetingInviteToken(meeting.smartNote, body.room, body.inviteToken)) {
        return NextResponse.json({ error: "Invite link is required to upload this recording." }, { status: 401 });
      }
    } else if (!user) {
      return NextResponse.json({ error: "Sign in is required to prepare an upload." }, { status: 401 });
    }
    const ext = cleanExtension(body.ext);
    const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const mimeType = typeof body.mimeType === "string" && /^(audio|video)\/[a-z0-9.+-]+$/i.test(body.mimeType)
      ? body.mimeType
      : ext === "mp3" ? "audio/mpeg" : ext === "mp4" ? "video/mp4" : ext === "m4a" ? "audio/mp4" : "audio/webm";
    const ticket = size > AUDIO_PART_BYTES
      ? await createSupabaseChunkedUploadTicket(size, mimeType)
      : await createSupabaseUploadTicket(filename);
    if (!ticket) {
      return NextResponse.json({ error: "Supabase Storage is not configured on this server." }, { status: 501 });
    }

    return NextResponse.json(ticket);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare a direct upload." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const audioUrl = body.audioUrl;
  if (!verifyChunkCleanupToken(audioUrl, body.cleanupToken)) {
    return NextResponse.json({ error: "Invalid upload cleanup token." }, { status: 401 });
  }
  const [meeting, segment] = await Promise.all([
    prisma.meeting.findFirst({ where: { audioUrl }, select: { id: true } }),
    prisma.meetingTranscriptSegment.findFirst({ where: { audioUrl }, select: { id: true } })
  ]);
  if (meeting || segment) return NextResponse.json({ error: "Recording is already in use." }, { status: 409 });
  try {
    await deleteStoredAudio(audioUrl);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove failed upload." }, { status: 500 });
  }
}
