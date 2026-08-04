import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const maxDuration = 60;

function defaultRecordingTitle() {
  return `ការថតសំឡេង ${new Date().toLocaleString()}`;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : defaultRecordingTitle();
    const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl.trim() : "";
    if (!audioUrl) return NextResponse.json({ error: "Missing saved audio URL." }, { status: 400 });
    const duration = Number.isFinite(Number(body.duration)) ? Number(body.duration) : 0;

    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        name: user.name ?? "Local Demo",
        email: user.email ?? "demo@khmermeet.ai",
        passwordHash: "local-no-login"
      }
    });

    const recording = await prisma.recording.create({
      data: { title, audioUrl, duration, createdById: user.id }
    });

    revalidatePath("/recordings");
    revalidatePath("/dashboard");

    return NextResponse.json({ recordingId: recording.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the recording.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
