import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { createSupabaseUploadTicket } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

function cleanExtension(value: unknown) {
  const ext = typeof value === "string" ? value.replace(/[^a-z0-9]/gi, "").slice(0, 8) : "";
  return ext || "webm";
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json().catch(() => ({}));
    const filename = `${Date.now()}-${crypto.randomUUID()}.${cleanExtension(body.ext)}`;

    const ticket = await createSupabaseUploadTicket(filename);
    if (!ticket) {
      return NextResponse.json({ error: "Supabase Storage is not configured on this server." }, { status: 501 });
    }

    return NextResponse.json(ticket);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare a direct upload." },
      { status: 500 }
    );
  }
}
