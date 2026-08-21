import { NextResponse } from "next/server";
import { createSupabaseUploadTicket } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyInviteToken } from "@/lib/livekit-invite";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

function cleanExtension(value: unknown) {
  const ext = typeof value === "string" ? value.replace(/[^a-z0-9]/gi, "").slice(0, 8) : "";
  return ext || "webm";
}

function isRecentLiveMeeting(meeting: { status: string; createdAt: Date } | null) {
  if (!meeting) return false;
  if (!["recording", "recorded", "transcribed"].includes(meeting.status)) return false;
  return Date.now() - meeting.createdAt.getTime() < 6 * 60 * 60 * 1000;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const meetingId = typeof body.meetingId === "string" ? body.meetingId.trim() : "";
    const session = await getServerSession(authOptions);
    if (meetingId) {
      const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { status: true, createdAt: true } });
      if (!isRecentLiveMeeting(meeting)) {
        return NextResponse.json({ error: "No live recording found for this upload." }, { status: 404 });
      }
      if (!session?.user?.id && !verifyInviteToken(body.room, body.inviteToken)) {
        return NextResponse.json({ error: "Invite link is required to upload this recording." }, { status: 401 });
      }
    } else if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in is required to prepare an upload." }, { status: 401 });
    }
    const filename = `${Date.now()}-${crypto.randomUUID()}.${cleanExtension(body.ext)}`;

    const ticket = await createSupabaseUploadTicket(filename);
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
