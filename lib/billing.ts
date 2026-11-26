import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { paidPlan, planForStripePrice } from "@/lib/billing-plans";

export { FREE_SECONDS } from "@/lib/billing-plans";

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured.");
  return new Stripe(key);
}

export function subscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return {
    start: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
    end: item?.current_period_end ? new Date(item.current_period_end * 1000) : null
  };
}

export async function syncStripeSubscription(subscription: Stripe.Subscription, expectedUserId?: string) {
  const metadataUserId = subscription.metadata.userId;
  const userId = expectedUserId || metadataUserId;
  if (expectedUserId && metadataUserId && metadataUserId !== expectedUserId) {
    throw new Error("Subscription belongs to another account.");
  }

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
  const account = userId
    ? await prisma.user.findUnique({ where: { id: userId }, include: { billing: true } })
    : await prisma.user.findFirst({
        where: { billing: { stripeCustomerId: customerId } },
        include: { billing: true }
      });
  if (!account || (account.billing?.stripeCustomerId && account.billing.stripeCustomerId !== customerId)) {
    throw new Error("Subscription account could not be verified.");
  }
  if (account.billing?.stripeSubscriptionId && account.billing.stripeSubscriptionId !== subscription.id &&
      subscription.status !== "active") return;

  const period = subscriptionPeriod(subscription);
  // The portal can change a subscription price without updating metadata.
  // Derive active entitlements from Stripe's actual recurring line item.
  const pricedPlan = subscription.items.data.length === 1
    ? planForStripePrice(subscription.items.data[0])
    : null;
  if (subscription.status === "active" && !pricedPlan) {
    throw new Error("Active subscription has an unrecognized plan price.");
  }
  const stripePlan = pricedPlan ?? paidPlan(subscription.metadata.plan);
  await prisma.$transaction([
    prisma.billingAccount.upsert({
      where: { userId: account.id },
      create: {
        userId: account.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripeStatus: subscription.status,
        stripePlan,
        stripePeriodStart: period.start,
        stripePeriodEnd: period.end
      },
      update: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripeStatus: subscription.status,
        stripePlan,
        stripePeriodStart: period.start,
        stripePeriodEnd: period.end
      }
    }),
    prisma.user.update({
      where: { id: account.id },
      data: { subscribed: subscription.status === "active" ? "TRUE" : "FALSE" }
    })
  ]);
}

export async function refreshStripeSubscription(userId: string) {
  const billing = await prisma.billingAccount.findUnique({ where: { userId } });
  if (!billing?.stripeSubscriptionId) return;
  try {
    const subscription = await stripeClient().subscriptions.retrieve(billing.stripeSubscriptionId);
    await syncStripeSubscription(subscription, userId);
  } catch (error) {
    console.error("Stripe subscription refresh failed", error);
  }
}
