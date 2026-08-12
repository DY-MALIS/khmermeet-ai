import { NextResponse } from "next/server";
import { createSupabaseSignedUrl } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const objectPath = path.map(decodeURIComponent).join("/");

  if (!objectPath || objectPath.includes("..")) {
    return NextResponse.json({ error: "Invalid storage path." }, { status: 400 });
  }

  const user = await requireUser();
  const audioUrl = `/api/storage/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  const owned = await prisma.meeting.findFirst({
    where: { audioUrl, createdById: user.id },
    select: { id: true }
  });
  if (!owned) {
    return NextResponse.json({ error: "Audio file not found." }, { status: 404 });
  }

  try {
    const signedUrl = await createSupabaseSignedUrl(objectPath);
    return NextResponse.redirect(signedUrl, { status: 307 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Storage file not found." },
      { status: 404 }
    );
  }
}
