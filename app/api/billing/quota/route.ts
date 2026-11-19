import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getUsageQuota } from "@/lib/usage-quota";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json(await getUsageQuota(user.id));
}
