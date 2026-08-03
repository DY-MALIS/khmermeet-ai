import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const projectFields = {
  title: true,
  mediaUrl: true,
  mediaName: true,
  mediaType: true,
  mediaSize: true,
  duration: true,
  sourceLanguage: true,
  targetLanguage: true,
  contentType: true,
  status: true,
  progress: true,
  rawTranscript: true,
  cleanTranscript: true,
  translatedText: true,
  speakerNames: true,
  customVocabulary: true,
  tags: true,
  folder: true,
  favorite: true,
  archived: true,
  summaryType: true,
  summaryLength: true,
  summaryLanguage: true,
  summaryResult: true,
  meetingMinutes: true,
  errorMessage: true
} as const;

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const project = await prisma.workbenchProject.findFirst({
        where: { id, ownerId: user.id },
        include: { versions: { orderBy: { createdAt: "desc" }, take: 30 } }
      });
      return project
        ? NextResponse.json({ project })
        : NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const projects = await prisma.workbenchProject.findMany({
      where: { ownerId: user.id, archived: false },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
    return NextResponse.json({ projects });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Database unavailable." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const project = await prisma.workbenchProject.create({
      data: {
        ownerId: user.id,
        title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled project",
        rawTranscript: typeof body.rawTranscript === "string" ? body.rawTranscript : "",
        cleanTranscript: typeof body.cleanTranscript === "string" ? body.cleanTranscript : "",
        translatedText: typeof body.translatedText === "string" ? body.translatedText : ""
      }
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create project." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown> & { id?: string };
    if (!body.id) return NextResponse.json({ error: "Project id is required." }, { status: 400 });
    const existing = await prisma.workbenchProject.findFirst({ where: { id: body.id, ownerId: user.id } });
    if (!existing) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const data = Object.fromEntries(
      Object.keys(projectFields)
        .filter((key) => Object.prototype.hasOwnProperty.call(body, key))
        .map((key) => [key, body[key]])
    );
    const project = await prisma.workbenchProject.update({ where: { id: body.id }, data });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save project." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Project id is required." }, { status: 400 });
    const existing = await prisma.workbenchProject.findFirst({ where: { id, ownerId: user.id } });
    if (!existing) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    await prisma.workbenchProject.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete project." },
      { status: 500 }
    );
  }
}

