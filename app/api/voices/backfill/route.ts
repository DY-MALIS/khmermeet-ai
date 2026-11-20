import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { backfillVoicesFromEarlierCalls } from "@/lib/voice/memory";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

export async function POST() {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-transcribe");
    if (limited) return limited;
    const result = await backfillVoicesFromEarlierCalls(user.id, "");
    return NextResponse.json(result);
  } catch (error) {
    console.error("Voice memory backfill failed", error);
    return NextResponse.json({ error: "Could not scan earlier named calls." }, { status: 500 });
  }
}
