import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { BILLING_PLANS, isPaidPlan } from "@/lib/billing-plans";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { manualPeriodEnd } from "@/lib/billing-period";

export async function POST(request: Request) {
  let adminId: string;
  try {
    const admin = await requireUser();
    if (!admin.isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    adminId = admin.id;
  } catch {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const requestedPlan: unknown = body.plan;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !isPaidPlan(requestedPlan)) {
    return NextResponse.json({ error: "A valid email and plan are required." }, { status: 400 });
  }
  const planId = requestedPlan;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, name: true, email: true } });
      if (!target) return { error: "Account not found. Ask the customer to sign in first.", status: 404 };
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${target.id} FOR UPDATE`;
      const billing = await tx.billingAccount.findUnique({ where: { userId: target.id } });
      const now = new Date();
      if (billing?.stripeStatus === "active" && billing.stripePeriodEnd && billing.stripePeriodEnd > now) {
        return { error: "This account has an active card subscription. Manage it through Stripe.", status: 409 };
      }
      if (billing?.manualPeriodEnd && billing.manualPeriodEnd > now) {
        return { error: "This account already has an active QR plan. Wait until it expires before granting another month.", status: 409 };
      }
      const end = manualPeriodEnd(now);
      const pending = await tx.manualPayment.findFirst({ where: { userId: target.id, status: "pending" }, orderBy: { createdAt: "desc" } });
      const payment = pending
        ? await tx.manualPayment.update({ where: { id: pending.id }, data: { plan: planId, status: "approved", reviewedAt: now, reviewedById: adminId } })
        : await tx.manualPayment.create({ data: { userId: target.id, plan: planId, transactionRef: `admin-${randomUUID()}`, status: "approved", reviewedAt: now, reviewedById: adminId } });
      await tx.billingAccount.upsert({
        where: { userId: target.id },
        create: { userId: target.id, manualPaymentId: payment.id, manualPlan: planId, manualPeriodStart: now, manualPeriodEnd: end },
        update: { manualPaymentId: payment.id, manualPlan: planId, manualPeriodStart: now, manualPeriodEnd: end }
      });
      await tx.billingAuditEvent.create({ data: {
        actorUserId: adminId,
        targetUserId: target.id,
        action: "manual_plan_granted",
        paymentId: payment.id,
        plan: planId
      } });
      return { ok: true, email: target.email, name: target.name, plan: planId, amountCents: BILLING_PLANS[planId].monthlyCents, periodEnd: end };
    });
    return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
  } catch (error) {
    console.error("Manual plan grant failed", error);
    return NextResponse.json({ error: "Could not grant the plan." }, { status: 500 });
  }
}
