import { prisma } from "@/lib/prisma";
import { refreshStripeSubscription } from "@/lib/billing";
import { BILLING_PLANS, FREE_SECONDS, paidPlan } from "@/lib/billing-plans";

export type UsageKind = "upload" | "live";

type Account = {
  id: string;
  billing: {
    unlimitedAccess: boolean;
    stripeStatus: string;
    stripeSubscriptionId: string | null;
    stripePlan: string;
    stripePeriodStart: Date | null;
    stripePeriodEnd: Date | null;
    manualPaymentId: string | null;
    manualPlan: string;
    manualPeriodStart: Date | null;
    manualPeriodEnd: Date | null;
  } | null;
};

export class UsageLimitError extends Error {
  constructor() {
    super("Monthly usage limit reached. Choose a larger plan to continue.");
    this.name = "UsageLimitError";
  }
}

export function planFor(account: Account, now: Date) {
  const billing = account.billing;
  const paid = billing?.stripeStatus === "active" &&
    Boolean(billing.stripeSubscriptionId && billing.stripePeriodStart && billing.stripePeriodEnd) &&
    billing.stripePeriodStart!.getTime() <= now.getTime() && billing.stripePeriodEnd!.getTime() > now.getTime();
  const manuallyPaid = Boolean(
    billing?.manualPaymentId && billing.manualPeriodStart && billing.manualPeriodEnd &&
    billing.manualPeriodStart.getTime() <= now.getTime() && billing.manualPeriodEnd.getTime() > now.getTime()
  );
  return paid
    ? {
        name: "pro" as const,
        planId: paidPlan(billing!.stripePlan),
        periodKey: `pro:${billing!.stripeSubscriptionId}:${billing!.stripePeriodStart!.toISOString()}`,
        periodEnd: billing!.stripePeriodEnd!,
        limitSeconds: BILLING_PLANS[paidPlan(billing!.stripePlan)].uploadSeconds,
        liveLimitSeconds: BILLING_PLANS[paidPlan(billing!.stripePlan)].liveSeconds
      }
    : manuallyPaid
      ? {
          name: "pro" as const,
          planId: paidPlan(billing!.manualPlan),
          periodKey: `manual:${billing!.manualPaymentId}:${billing!.manualPeriodStart!.toISOString()}`,
          periodEnd: billing!.manualPeriodEnd!,
          limitSeconds: BILLING_PLANS[paidPlan(billing!.manualPlan)].uploadSeconds,
          liveLimitSeconds: BILLING_PLANS[paidPlan(billing!.manualPlan)].liveSeconds
        }
      : {
        name: "free" as const,
        planId: "free" as const,
        periodKey: `free:${now.toISOString().slice(0, 7)}`,
        periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
        limitSeconds: FREE_SECONDS,
        liveLimitSeconds: FREE_SECONDS
      };
}

export async function getUsageQuota(userId: string) {
  await refreshStripeSubscription(userId);
  const account = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { billing: true } });
  const plan = planFor(account, new Date());
  const [usage, liveUsage, latestManualPayment] = await Promise.all([
    prisma.usageCharge.aggregate({
      where: { userId, periodKey: plan.periodKey, kind: "upload" },
      _sum: { seconds: true }
    }),
    prisma.usageCharge.aggregate({
      where: { userId, periodKey: plan.periodKey, kind: "live" },
      _sum: { seconds: true }
    }),
    prisma.manualPayment.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, createdAt: true }
    })
  ]);
  const usedSeconds = usage._sum.seconds ?? 0;
  const liveUsedSeconds = liveUsage._sum.seconds ?? 0;
  return {
    plan: account.billing?.unlimitedAccess ? "unlimited" as const : plan.name,
    planId: account.billing?.unlimitedAccess ? "unlimited" as const : plan.planId,
    billingMethod: plan.name === "pro" ? plan.periodKey.startsWith("pro:") ? "card" as const : "qr" as const : null,
    usedSeconds,
    limitSeconds: account.billing?.unlimitedAccess ? null : plan.limitSeconds,
    remainingSeconds: account.billing?.unlimitedAccess ? null : Math.max(0, plan.limitSeconds - usedSeconds),
    liveUsedSeconds,
    liveLimitSeconds: account.billing?.unlimitedAccess ? null : plan.liveLimitSeconds,
    liveRemainingSeconds: account.billing?.unlimitedAccess ? null : Math.max(0, plan.liveLimitSeconds - liveUsedSeconds),
    periodEnd: plan.periodEnd,
    manualPaymentStatus: latestManualPayment?.status ?? null,
    manualPaymentCreatedAt: latestManualPayment?.createdAt ?? null,
    qrAvailable: true
  };
}

// Lock the account row so simultaneous uploads cannot each spend the same remaining minutes.
export async function chargeAudioUsage(userId: string, sourceKey: string, seconds: number, kind: UsageKind = "upload", refreshSubscription = true) {
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 12 * 60 * 60) {
    throw new Error("A valid audio duration is required.");
  }
  if (refreshSubscription) await refreshStripeSubscription(userId);
  const exhausted = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const account = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { billing: true } });
    const plan = planFor(account, new Date());
    const existing = await tx.usageCharge.findUnique({ where: { sourceKey } });
    if (existing && existing.userId !== userId) {
      throw new Error("Audio usage belongs to another account.");
    }
    if (existing && existing.kind !== kind) throw new Error("Usage type cannot change.");
    if (existing && existing.periodKey !== plan.periodKey) return kind === "live";
    if (existing && existing.seconds >= seconds) return false;
    const additionalSeconds = seconds - (existing?.seconds ?? 0);
    let allowedSeconds = seconds;
    let atLimit = false;
    if (!account.billing?.unlimitedAccess) {
      const total = await tx.usageCharge.aggregate({
        where: { userId, periodKey: plan.periodKey, kind },
        _sum: { seconds: true }
      });
      const limit = kind === "live" ? plan.liveLimitSeconds : plan.limitSeconds;
      const available = Math.max(0, limit - (total._sum.seconds ?? 0));
      if (additionalSeconds > available) {
        if (kind === "upload") throw new UsageLimitError();
        allowedSeconds = (existing?.seconds ?? 0) + available;
        atLimit = true;
      }
    }
    if (existing) {
      await tx.usageCharge.update({ where: { id: existing.id }, data: { seconds: allowedSeconds } });
    } else {
      await tx.usageCharge.create({ data: { userId, sourceKey, periodKey: plan.periodKey, kind, seconds: allowedSeconds } });
    }
    return atLimit;
  });
  if (exhausted) throw new UsageLimitError();
}

export async function requireAudioAllowance(userId: string, kind: UsageKind = "upload") {
  const quota = await getUsageQuota(userId);
  const remaining = kind === "live" ? quota.liveRemainingSeconds : quota.remainingSeconds;
  if (remaining !== null && remaining <= 0) throw new UsageLimitError();
  return quota;
}

