import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { providerAccessToken } from "@/lib/provider-oauth";

type ZoomFile = { id?: string; file_type?: string; file_extension?: string; download_url?: string };
type ZoomMeeting = { uuid?: string; topic?: string; start_time?: string; recording_files?: ZoomFile[] };

export async function GET() {
  const user = await requireUser();
  try {
    const token = await providerAccessToken(user.id, "zoom");
    const since = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString().slice(0, 10);
    const url = `https://api.zoom.us/v2/users/me/recordings?from=${since}&page_size=30`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => ({})) as { meetings?: ZoomMeeting[]; message?: string };
    if (!response.ok) return NextResponse.json({ error: result.message ?? "Could not list Zoom recordings." }, { status: 502 });
    return NextResponse.json({ meetings: (result.meetings ?? []).filter((meeting) => meeting.recording_files?.some((file) => file.file_type === "TRANSCRIPT" || file.file_extension === "VTT")).map((meeting) => ({ uuid: meeting.uuid, topic: meeting.topic, startTime: meeting.start_time })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Zoom connection failed." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const user = await requireUser();
  const { uuid } = await request.json().catch(() => ({})) as { uuid?: string };
  if (typeof uuid !== "string" || !uuid || uuid.length > 256) return NextResponse.json({ error: "Zoom recording ID is required." }, { status: 400 });
  try {
    const token = await providerAccessToken(user.id, "zoom");
    const response = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(encodeURIComponent(uuid))}/recordings`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => ({})) as ZoomMeeting & { message?: string };
    if (!response.ok) return NextResponse.json({ error: result.message ?? "Zoom recording could not be read." }, { status: 502 });
    const transcriptFile = result.recording_files?.find((file) => file.file_type === "TRANSCRIPT" || file.file_extension === "VTT");
    if (!transcriptFile?.download_url || !/^https:\/\/([a-z0-9-]+\.)*zoom\.us\//i.test(transcriptFile.download_url)) return NextResponse.json({ error: "No cloud transcript is available." }, { status: 404 });
    const transcriptResponse = await fetch(transcriptFile.download_url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    if (!transcriptResponse.ok) return NextResponse.json({ error: "Zoom transcript download failed." }, { status: 502 });
    const transcript = (await transcriptResponse.text()).slice(0, 500_000).replace(/^WEBVTT.*$/m, "").replace(/^\d{2}:\d{2}:\d{2}\.\d+ --> .*$/gm, "").trim();
    if (!transcript) return NextResponse.json({ error: "Zoom transcript is empty." }, { status: 422 });
    const { prisma } = await import("@/lib/prisma");
    const sourceId = `zoom:${uuid}`;
    const existing = await prisma.integrationArtifact.findUnique({ where: { userId_provider_sourceId: { userId: user.id, provider: "zoom", sourceId } } });
    if (existing) return NextResponse.json({ meetingId: existing.externalId, alreadyImported: true });
    const meeting = await prisma.meeting.create({ data: { title: result.topic || "Zoom recording", createdById: user.id, transcript, status: "transcribed", language: "auto" } });
    await prisma.integrationArtifact.upsert({ where: { userId_provider_sourceId: { userId: user.id, provider: "zoom", sourceId } }, create: { userId: user.id, provider: "zoom", sourceId, externalId: meeting.id }, update: { externalId: meeting.id } });
    return NextResponse.json({ meetingId: meeting.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Zoom import failed." }, { status: 502 });
  }
}
