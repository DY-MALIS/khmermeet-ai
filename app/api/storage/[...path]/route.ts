import { NextResponse } from "next/server";
import { createSupabaseSignedUrl, getChunkedAudioManifest, readChunkedAudioRange } from "@/lib/storage";
import { audioResponseRange, isChunkManifestPath } from "@/lib/chunked-audio";
import { prisma } from "@/lib/prisma";
import { meetingOwnerWhere, ownerWhere, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const objectPath = path.map(decodeURIComponent).join("/");

  if (!objectPath || objectPath.includes("..")) {
    return NextResponse.json({ error: "Invalid storage path." }, { status: 400 });
  }

  const user = await requireUser();
  const audioUrl = `/api/storage/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  // Server Rec meetings never set meeting.audioUrl - each participant's own
  // full-call recording lives on a MeetingTranscriptSegment row instead
  // (see components/livekit-call-room.tsx), so ownership also has to be
  // checked there, through the segment's parent meeting.
  const [ownedMeeting, ownedSegment] = await Promise.all([
    prisma.meeting.findFirst({ where: { audioUrl, ...ownerWhere(user) }, select: { id: true } }),
    prisma.meetingTranscriptSegment.findFirst({
      where: { audioUrl, ...meetingOwnerWhere(user) },
      select: { id: true }
    })
  ]);
  if (!ownedMeeting && !ownedSegment) {
    return NextResponse.json({ error: "Audio file not found." }, { status: 404 });
  }

  try {
    if (isChunkManifestPath(objectPath)) {
      const manifest = await getChunkedAudioManifest(objectPath);
      const range = audioResponseRange(request.headers.get("range"), manifest.size);
      if (!range) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${manifest.size}` } });
      }
      const length = range.end - range.start + 1;
      const bytes = await readChunkedAudioRange(objectPath, range.start, range.end);
      return new Response(new Uint8Array(bytes), {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${range.start}-${range.end}/${manifest.size}`,
          "Content-Length": String(length),
          "Content-Type": manifest.mimeType,
          "Cache-Control": "private, no-store"
        }
      });
    }
    const signedUrl = await createSupabaseSignedUrl(objectPath);
    return NextResponse.redirect(signedUrl, { status: 307 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Storage file not found." },
      { status: 404 }
    );
  }
}
