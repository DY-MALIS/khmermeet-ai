import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { stripeClient } from "@/lib/billing";

export async function POST() {
  try {
    const user = await requireUser();
    const account = await prisma.billingAccount.findUnique({ where: { userId: user.id } });
    if (!account?.stripeCustomerId) return NextResponse.json({ error: "No billing account found." }, { status: 404 });
    const session = await stripeClient().billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: `${process.env.NEXTAUTH_URL || "https://khmermeet-ai.vercel.app"}/settings`
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not open billing portal." }, { status: 500 });
  }
}

