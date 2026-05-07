import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getLocalAudioPath } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const safeName = path.basename(name);
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
