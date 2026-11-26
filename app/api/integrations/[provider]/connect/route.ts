import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { authorizationUrl, isProvider, oauthStateHash } from "@/lib/provider-oauth";

export async function GET(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return NextResponse.json({ error: "Unknown integration." }, { status: 404 });
  const user = await requireUser();
  const state = randomBytes(32).toString("base64url");
  const url = authorizationUrl(provider, state);
  await prisma.integrationOAuthState.create({
    data: { tokenHash: oauthStateHash(state), userId: user.id, provider, expiresAt: new Date(Date.now() + 10 * 60_000) }
  });
  return NextResponse.redirect(url);
}
