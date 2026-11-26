import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { stripeClient } from "@/lib/billing";
import { BILLING_PLANS, isPaidPlan } from "@/lib/billing-plans";
import { getUsageQuota } from "@/lib/usage-quota";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const planId = body.plan;
    if (!isPaidPlan(planId)) return NextResponse.json({ error: "Choose a valid plan." }, { status: 400 });
    const plan = BILLING_PLANS[planId];
    const quota = await getUsageQuota(user.id);
    // Admins can inspect and complete checkout while their Unlimited grant remains intact.
    if (quota.plan === "pro" || (quota.plan === "unlimited" && !user.isAdmin)) {
      return NextResponse.json({ error: "This account already has access." }, { status: 409 });
    }
    const stripe = stripeClient();
    const account = await prisma.billingAccount.findUnique({ where: { userId: user.id } });
    if (account?.stripeCustomerId && account.stripeSubscriptionId &&
      ["active", "past_due", "unpaid", "incomplete"].includes(account.stripeStatus)) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: account.stripeCustomerId,
        return_url: `${process.env.NEXTAUTH_URL || "https://khmermeet-ai.vercel.app"}/settings`
      });
      return NextResponse.json({ url: portal.url });
    }
    let customerId = account?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: user.id } });
      customerId = customer.id;
      await prisma.billingAccount.upsert({ where: { userId: user.id }, create: { userId: user.id, stripeCustomerId: customerId }, update: { stripeCustomerId: customerId } });
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
          unit_amount: plan.monthlyCents,
          recurring: { interval: "month" },
          product_data: { name: `KhmerMeet ${plan.name}`, description: `${plan.uploadSeconds / 3600} upload speech hours and ${plan.liveSeconds / 3600} LiveKit meeting hours per month` }
        },
        quantity: 1
      }],
      subscription_data: { metadata: { userId: user.id, plan: planId } },
      success_url: `${baseUrl}/api/billing/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/settings?checkout=cancelled`
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start checkout." }, { status: 500 });
  }
}

