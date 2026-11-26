import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { providerAccessToken } from "@/lib/provider-oauth";

export async function POST(request: Request) {
  const user = await requireUser();
  const { meetingId, channel } = await request.json().catch(() => ({})) as { meetingId?: string; channel?: string };
  if (typeof meetingId !== "string" || typeof channel !== "string" || !/^[A-Z0-9]{8,20}$/.test(channel)) {
    return NextResponse.json({ error: "Meeting and Slack channel ID are required." }, { status: 400 });
  }
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, createdById: user.id }, select: { title: true, summary: true } });
  if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  if (!meeting.summary) return NextResponse.json({ error: "Generate a summary first." }, { status: 400 });
  try {
    const accessToken = await providerAccessToken(user.id, "slack");
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel, text: `*${meeting.title}*\n${meeting.summary}`.slice(0, 39000) }), signal: AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; ts?: string };
    if (!response.ok || !result.ok) return NextResponse.json({ error: result.error ?? "Could not post to Slack." }, { status: 502 });
    return NextResponse.json({ ok: true, timestamp: result.ts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Slack connection failed." }, { status: 502 });
  }
}
