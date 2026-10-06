import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// A remembered person is every voice sample stored under their name
// (case-insensitive), so renaming or forgetting acts on all of them.
function samplesOf(ownerId: string, name: string) {
  return { ownerId, name: { equals: name.trim(), mode: "insensitive" as const } };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const user = await requireUser();
    const name = decodeURIComponent((await params).name);
    const body = await request.json().catch(() => ({}));
    const newName = String(body?.newName ?? "").trim().slice(0, 80);
    if (!newName) return NextResponse.json({ error: "A name is required." }, { status: 400 });
    const { count } = await prisma.voiceSample.updateMany({ where: samplesOf(user.id, name), data: { name: newName } });
    if (!count) return NextResponse.json({ error: "No voice found." }, { status: 404 });
    return NextResponse.json({ name: newName });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not rename." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const user = await requireUser();
    const name = decodeURIComponent((await params).name);
    const { count } = await prisma.voiceSample.deleteMany({ where: samplesOf(user.id, name) });
    if (!count) return NextResponse.json({ error: "No voice found." }, { status: 404 });
    return NextResponse.json({ deleted: count });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete." }, { status: 500 });
  }
}
