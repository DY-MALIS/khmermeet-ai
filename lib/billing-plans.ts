export const BILLING_PLANS = {
  starter: { name: "Starter", monthlyCents: 1500, uploadSeconds: 10 * 3600, liveSeconds: 2 * 3600 },
  plus: { name: "Plus", monthlyCents: 2500, uploadSeconds: 15 * 3600, liveSeconds: 6 * 3600 },
  premium: { name: "Premium", monthlyCents: 3500, uploadSeconds: 20 * 3600, liveSeconds: 10 * 3600 }
} as const;

export type PaidPlan = keyof typeof BILLING_PLANS;
export const FREE_SECONDS = 20 * 60;

export function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === "string" && Object.hasOwn(BILLING_PLANS, value);
}

export function paidPlan(value: unknown): PaidPlan {
  return isPaidPlan(value) ? value : "starter";
}

export function planForStripePrice(item: {
  quantity?: number | null;
  price: { unit_amount: number | null; currency: string; recurring: { interval: string } | null };
}): PaidPlan | null {
  if (item.quantity !== 1 || item.price.currency.toLowerCase() !== "usd" || item.price.recurring?.interval !== "month") return null;
  return (Object.entries(BILLING_PLANS) as [PaidPlan, (typeof BILLING_PLANS)[PaidPlan]][])
    .find(([, plan]) => plan.monthlyCents === item.price.unit_amount)?.[0] ?? null;
}
