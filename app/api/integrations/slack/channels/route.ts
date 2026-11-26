import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { providerAccessToken } from "@/lib/provider-oauth";

export async function GET() {
  const user = await requireUser();
  try {
    const token = await providerAccessToken(user.id, "slack");
    const response = await fetch("https://slack.com/api/conversations.list?types=public_channel&limit=200&exclude_archived=true", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; channels?: Array<{ id: string; name: string }> };
    if (!response.ok || !result.ok) return NextResponse.json({ error: result.error ?? "Could not list Slack channels." }, { status: 502 });
    return NextResponse.json({ channels: (result.channels ?? []).map(({ id, name }) => ({ id, name })) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Slack connection failed." }, { status: 502 }); }
}
