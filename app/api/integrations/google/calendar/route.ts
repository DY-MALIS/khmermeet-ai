import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { providerAccessToken } from "@/lib/provider-oauth";

export async function POST(request: Request) {
  const user = await requireUser();
  const { meetingId } = await request.json().catch(() => ({})) as { meetingId?: string };
  if (typeof meetingId !== "string") return NextResponse.json({ error: "Meeting is required." }, { status: 400 });
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, createdById: user.id } });
  if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  const existing = await prisma.integrationArtifact.findUnique({ where: { userId_provider_sourceId: { userId: user.id, provider: "google", sourceId: meetingId } } });
  if (existing) return NextResponse.json({ eventId: existing.externalId, alreadyCreated: true });
  try {
    const accessToken = await providerAccessToken(user.id, "google");
    const start = meeting.createdAt;
    const end = new Date(start.getTime() + Math.max(meeting.duration, 30 * 60) * 1000);
    const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ summary: meeting.title, description: meeting.summary ?? "", start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } }),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(() => ({})) as { id?: string; error?: { message?: string } };
    if (!response.ok || !result.id) return NextResponse.json({ error: result.error?.message ?? "Calendar event could not be created." }, { status: 502 });
    await prisma.integrationArtifact.upsert({ where: { userId_provider_sourceId: { userId: user.id, provider: "google", sourceId: meetingId } }, create: { userId: user.id, provider: "google", sourceId: meetingId, externalId: result.id }, update: { externalId: result.id } });
    return NextResponse.json({ eventId: result.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Calendar connection failed." }, { status: 502 });
  }
}
