import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getLocalAudioPath } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const safeName = path.basename(name);
  const dbAudio = await prisma.audioFile.findUnique({
    where: { id: safeName }
  }).catch(() => null);

  if (dbAudio) {
    return new NextResponse(Buffer.from(dbAudio.data), {
      headers: {
        "Content-Type": dbAudio.mimeType,
        "Content-Length": String(dbAudio.size),
        "Cache-Control": "private, max-age=31536000"
      }
    });
  }

  try {
    const file = await readFile(getLocalAudioPath(safeName));
    return new NextResponse(file, {
      headers: {
        "Content-Type": safeName.endsWith(".webm")
          ? "audio/webm"
          : safeName.endsWith(".m4a")
            ? "audio/mp4"
            : "application/octet-stream"
      }
    });
  } catch {
    return NextResponse.json({ error: "Audio file not found." }, { status: 404 });
  }
}
