import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PRO_MONTHLY_CENTS, stripeClient } from "@/lib/billing";
import { getUsageQuota } from "@/lib/usage-quota";

export async function POST() {
  try {
    const user = await requireUser();
    const quota = await getUsageQuota(user.id);
    if (quota.plan === "pro" || quota.plan === "unlimited") {
      return NextResponse.json({ error: "This account already has access." }, { status: 409 });
    }
    const stripe = stripeClient();
    const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (account.stripeCustomerId && account.stripeSubscriptionId &&
      ["active", "past_due", "unpaid", "incomplete"].includes(account.stripeStatus)) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: account.stripeCustomerId,
        return_url: `${process.env.NEXTAUTH_URL || "https://khmermeet-ai.vercel.app"}/settings`
      });
      return NextResponse.json({ url: portal.url });
    }
    let customerId = account.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: user.id } });
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }
    const prior = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    if (prior.data.some((subscription) => subscription.status === "active" || subscription.status === "trialing")) {
      return NextResponse.json({ error: "A subscription is already active. Please refresh Settings or contact support if access has not updated." }, { status: 409 });
    }
    const baseUrl = process.env.NEXTAUTH_URL || "https://khmermeet-ai.vercel.app";
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: PRO_MONTHLY_CENTS,
          recurring: { interval: "month" },
          product_data: { name: "KhmerMeet Pro", description: "10 hours of audio each billing month" }
        },
        quantity: 1
      }],
      subscription_data: { metadata: { userId: user.id } },
      success_url: `${baseUrl}/settings?checkout=success`,
      cancel_url: `${baseUrl}/settings?checkout=cancelled`
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start checkout." }, { status: 500 });
  }
}
