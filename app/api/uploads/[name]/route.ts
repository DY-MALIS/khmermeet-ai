import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getLocalAudioPath } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

function contentTypeFromName(name: string) {
  return name.endsWith(".webm")
    ? "audio/webm"
    : name.endsWith(".m4a") || name.endsWith(".mp4")
      ? "audio/mp4"
      : name.endsWith(".mp3")
        ? "audio/mpeg"
        : "application/octet-stream";
}

function audioResponse(data: Buffer, contentType: string, request: Request) {
  const body = new Uint8Array(data);
  const headers = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000"
  };
  const range = request.headers.get("range");
  if (!range) {
    return new NextResponse(body, {
      headers: {
        ...headers,
        "Content-Length": String(data.length)
      }
    });
  }

  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return new NextResponse(body, {
      headers: {
        ...headers,
        "Content-Length": String(data.length)
      }
    });
  }

  const startText = match[1];
  const endText = match[2];
  let start = startText ? Number(startText) : 0;
  let end = endText ? Number(endText) : data.length - 1;

  if (!startText && endText) {
    const suffixLength = Number(endText);
    start = Math.max(0, data.length - suffixLength);
    end = data.length - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= data.length) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        ...headers,
        "Content-Range": `bytes */${data.length}`
      }
    });
  }

  end = Math.min(end, data.length - 1);
  const chunk = new Uint8Array(data.subarray(start, end + 1));
  return new NextResponse(chunk, {
    status: 206,
    headers: {
      ...headers,
      "Content-Length": String(chunk.length),
      "Content-Range": `bytes ${start}-${end}/${data.length}`
    }
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const safeName = path.basename(name);

  const user = await requireUser();
  const owned = await prisma.meeting.findFirst({
    where: { audioUrl: `/api/uploads/${safeName}`, createdById: user.id },
    select: { id: true }
  });
  if (!owned) {
    return NextResponse.json({ error: "Audio file not found." }, { status: 404 });
  }

  const dbAudio = await prisma.audioFile.findUnique({
    where: { id: safeName }
  }).catch(() => null);

  if (dbAudio) {
    return audioResponse(Buffer.from(dbAudio.data), dbAudio.mimeType, request);
  }

  try {
    const file = await readFile(getLocalAudioPath(safeName));
    return audioResponse(file, contentTypeFromName(safeName), request);
  } catch {
    return NextResponse.json({ error: "Audio file not found." }, { status: 404 });
  }
}
