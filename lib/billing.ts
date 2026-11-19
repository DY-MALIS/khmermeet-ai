import Stripe from "stripe";

export const FREE_SECONDS = 30 * 60;
export const PRO_SECONDS = 10 * 60 * 60;
export const PRO_MONTHLY_CENTS = 1500;

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
