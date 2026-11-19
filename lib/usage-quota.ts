import { prisma } from "@/lib/prisma";
import { FREE_SECONDS, PRO_SECONDS, refreshStripeSubscription } from "@/lib/billing";

type Account = {
  id: string;
  billing: {
    unlimitedAccess: boolean;
    stripeStatus: string;
    stripeSubscriptionId: string | null;
    stripePeriodStart: Date | null;
    stripePeriodEnd: Date | null;
    manualPaymentId: string | null;
    manualPeriodStart: Date | null;
    manualPeriodEnd: Date | null;
  } | null;
};

export class UsageLimitError extends Error {
  constructor() {
    super("Monthly audio limit reached. Subscribe to continue using KhmerMeet AI.");
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
        periodKey: `pro:${billing!.stripeSubscriptionId}:${billing!.stripePeriodStart!.toISOString()}`,
        periodEnd: billing!.stripePeriodEnd!,
        limitSeconds: PRO_SECONDS
      }
    : manuallyPaid
      ? {
          name: "pro" as const,
          periodKey: `manual:${billing!.manualPaymentId}:${billing!.manualPeriodStart!.toISOString()}`,
          periodEnd: billing!.manualPeriodEnd!,
          limitSeconds: PRO_SECONDS
        }
      : {
        name: "free" as const,
        periodKey: `free:${now.toISOString().slice(0, 7)}`,
        periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
        limitSeconds: FREE_SECONDS
      };
}

export async function getUsageQuota(userId: string) {
  await refreshStripeSubscription(userId);
  const account = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { billing: true } });
  const plan = planFor(account, new Date());
  const [usage, latestManualPayment] = await Promise.all([
    prisma.usageCharge.aggregate({
      where: { userId, periodKey: plan.periodKey },
      _sum: { seconds: true }
    }),
    prisma.manualPayment.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, createdAt: true }
    })
  ]);
  const usedSeconds = usage._sum.seconds ?? 0;
  return {
    plan: account.billing?.unlimitedAccess ? "unlimited" as const : plan.name,
    usedSeconds,
    limitSeconds: account.billing?.unlimitedAccess ? null : plan.limitSeconds,
    remainingSeconds: account.billing?.unlimitedAccess ? null : Math.max(0, plan.limitSeconds - usedSeconds),
    periodEnd: plan.periodEnd,
    manualPaymentStatus: latestManualPayment?.status ?? null,
    manualPaymentCreatedAt: latestManualPayment?.createdAt ?? null,
    qrAvailable: true
  };
}

// Lock the account row so simultaneous uploads cannot each spend the same remaining minutes.
export async function chargeAudioUsage(userId: string, sourceKey: string, seconds: number) {
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 12 * 60 * 60) {
    throw new Error("A valid audio duration is required.");
  }
  await refreshStripeSubscription(userId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const account = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { billing: true } });
    const plan = planFor(account, new Date());
    const existing = await tx.usageCharge.findUnique({ where: { sourceKey } });
    if (existing && existing.userId !== userId) {
      throw new Error("Audio usage belongs to another account.");
    }
    if (existing && (existing.seconds >= seconds || existing.periodKey !== plan.periodKey)) return;
    const additionalSeconds = seconds - (existing?.seconds ?? 0);
    if (!account.billing?.unlimitedAccess) {
      const total = await tx.usageCharge.aggregate({
        where: { userId, periodKey: plan.periodKey },
        _sum: { seconds: true }
      });
      if ((total._sum.seconds ?? 0) + additionalSeconds > plan.limitSeconds) throw new UsageLimitError();
    }
    if (existing) {
      await tx.usageCharge.update({ where: { id: existing.id }, data: { seconds } });
    } else {
      await tx.usageCharge.create({ data: { userId, sourceKey, periodKey: plan.periodKey, seconds } });
    }
  });
}

export async function requireAudioAllowance(userId: string) {
  const quota = await getUsageQuota(userId);
  if (quota.remainingSeconds !== null && quota.remainingSeconds <= 0) throw new UsageLimitError();
  return quota;
}

