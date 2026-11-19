import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeClient, subscriptionPeriod } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function syncSubscription(subscription: Stripe.Subscription) {
  const userId = subscription.metadata.userId;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const account = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await prisma.user.findUnique({ where: { stripeCustomerId: customerId } });
  if (!account || (account.stripeCustomerId && account.stripeCustomerId !== customerId)) return;
  if (account.stripeSubscriptionId && account.stripeSubscriptionId !== subscription.id &&
    subscription.status !== "active") return;
  const period = subscriptionPeriod(subscription);
  await prisma.user.update({
    where: { id: account.id },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripeStatus: subscription.status,
      stripePeriodStart: period.start,
      stripePeriodEnd: period.end,
      subscribed: subscription.status === "active" ? "TRUE" : "FALSE"
    }
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const id = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (id) await syncSubscription(await stripeClient().subscriptions.retrieve(id));
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      // Fetch the latest state to make delayed or repeated webhooks harmless.
      const incoming = event.data.object as Stripe.Subscription;
      const current = await stripeClient().subscriptions.retrieve(incoming.id).catch(() => incoming);
      await syncSubscription(current);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook sync failed", error);
    return NextResponse.json({ error: "Could not sync subscription." }, { status: 500 });
  }
}
