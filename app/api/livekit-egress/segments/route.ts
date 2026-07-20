import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { listSupabaseStorageFolder } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    await requireUser();
    const prefix = new URL(request.url).searchParams.get("prefix")?.trim() || "";
    if (!prefix.startsWith("livekit-egress/") || prefix.includes("..")) {
      return NextResponse.json({ error: "Invalid segments prefix." }, { status: 400 });
    }

    const segments = await listSupabaseStorageFolder(prefix);
    return NextResponse.json({ segments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list recording segments." },
      { status: 500 }
    );
  }
}
