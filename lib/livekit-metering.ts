import { RoomServiceClient } from "livekit-server-sdk";
import { prisma } from "@/lib/prisma";
import { chargeAudioUsage, UsageLimitError } from "@/lib/usage-quota";
import { MAX_MEETING_DURATION_SECONDS } from "@/lib/meeting-duration";

export function liveKitRoomService() {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) throw new Error("LiveKit is not configured.");
  return new RoomServiceClient(url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"), key, secret);
}

export function usageSessionFromMetadata(metadata: string): string | null {
  try {
    const id = JSON.parse(metadata)?.usageSessionId;
    return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function liveSeconds(baseSeconds: number, startedAt: Date, now: Date) {
  return Math.min(MAX_MEETING_DURATION_SECONDS, baseSeconds + Math.max(0, Math.ceil((now.getTime() - startedAt.getTime()) / 1000)));
}

export async function meterLiveParticipant(input: {
  sessionId: string;
  room: string;
  identity: string;
  joinedAt: Date;
  now?: Date;
  leaving?: boolean;
}) {
  const now = input.now ?? new Date();
  let session = await prisma.liveUsageSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.room !== input.room || session.identity !== input.identity) return "unknown" as const;
  if (input.leaving && session.endedAt) return "ok" as const;
  if (!session.startedAt || session.endedAt) {
    const existing = await prisma.usageCharge.findUnique({ where: { sourceKey: `live-session:${session.id}` } });
    if (!existing || existing.userId !== session.userId || existing.kind !== "live") return "unknown" as const;
    const joinedAt = new Date(Math.max(session.createdAt.getTime(), Math.min(input.joinedAt.getTime(), now.getTime())));
    await prisma.liveUsageSession.updateMany({
      where: { id: session.id, OR: [{ startedAt: null }, { endedAt: { not: null } }] },
      data: { startedAt: joinedAt, baseSeconds: existing.seconds, endedAt: null }
    });
    session = await prisma.liveUsageSession.findUniqueOrThrow({ where: { id: input.sessionId } });
  }
  const target = liveSeconds(session.baseSeconds, session.startedAt!, now);
  try {
    await chargeAudioUsage(session.userId, `live-session:${session.id}`, target, "live", false);
  } catch (error) {
    // A session cannot span billing periods under its original source key.
    // A fresh token after the boundary starts a new metered session.
    if (!(error instanceof UsageLimitError) && !(error instanceof Error && error.message === "Usage session belongs to a different billing period.")) throw error;
    await liveKitRoomService().removeParticipant(session.room, session.identity).catch(() => {});
    await prisma.liveUsageSession.update({ where: { id: session.id }, data: { endedAt: now } });
    return "limit" as const;
  }
  // Bound one token to twelve hours even when the account has more quota.
  // Otherwise the capped charge would stop increasing while the room stayed open.
  if (!input.leaving && target >= MAX_MEETING_DURATION_SECONDS) {
    await liveKitRoomService().removeParticipant(session.room, session.identity).catch(() => {});
    await prisma.liveUsageSession.update({ where: { id: session.id }, data: { endedAt: now } });
    return "limit" as const;
  }
  if (input.leaving) await prisma.liveUsageSession.update({ where: { id: session.id }, data: { endedAt: now } });
  return "ok" as const;
}
