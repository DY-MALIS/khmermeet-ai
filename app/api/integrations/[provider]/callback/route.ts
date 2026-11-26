import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { exchangeAuthorizationCode, isProvider, oauthStateHash, saveConnection } from "@/lib/provider-oauth";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return NextResponse.json({ error: "Unknown integration." }, { status: 404 });
  const user = await requireUser();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const stored = await prisma.integrationOAuthState.findUnique({ where: { tokenHash: oauthStateHash(state) } });
  if (!code || !stored || stored.provider !== provider || stored.userId !== user.id || stored.expiresAt <= new Date()) {
    return NextResponse.redirect(new URL("/settings?integration_error=invalid_state", url.origin));
  }
  const consumed = await prisma.integrationOAuthState.deleteMany({ where: { tokenHash: stored.tokenHash, userId: user.id } });
  if (!consumed.count) return NextResponse.redirect(new URL("/settings?integration_error=invalid_state", url.origin));
  try {
    await saveConnection(user.id, provider, await exchangeAuthorizationCode(provider, code));
    return NextResponse.redirect(new URL(`/settings?integration_connected=${provider}`, url.origin));
  } catch {
    return NextResponse.redirect(new URL(`/settings?integration_error=${provider}`, url.origin));
  }
}
