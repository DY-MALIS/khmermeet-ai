import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

async function assertProjectOwner(projectId: string, ownerId: string) {
  const project = await prisma.workbenchProject.findFirst({ where: { id: projectId, ownerId } });
  return Boolean(project);
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    if (!(await assertProjectOwner(projectId, user.id))) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const versions = await prisma.workbenchVersion.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return NextResponse.json({ versions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load versions." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { projectId?: string; kind?: string; content?: string };
    if (!body.projectId || !body.content) {
      return NextResponse.json({ error: "projectId and content are required." }, { status: 400 });
    }
    if (!(await assertProjectOwner(body.projectId, user.id))) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const version = await prisma.workbenchVersion.create({
      data: { projectId: body.projectId, kind: body.kind ?? "manual", content: body.content }
    });
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create version." },
      { status: 500 }
    );
  }
}
