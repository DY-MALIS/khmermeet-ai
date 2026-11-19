import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isPaidPlan } from "@/lib/billing-plans";

async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) throw new Error("FORBIDDEN");
  return user;
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const [payments, approved] = await Promise.all([
    prisma.manualPayment.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      select: { id: true, plan: true, createdAt: true, user: { select: { name: true, email: true } } }
    }),
    prisma.manualPayment.findMany({
      where: { status: "approved" },
      orderBy: { reviewedAt: "desc" },
      take: 30,
      select: { id: true, plan: true, reviewedAt: true, user: { select: { name: true, email: true } } }
    })
  ]);
  return NextResponse.json({ payments, approved });
}

export async function POST(request: Request) {
  let adminId: string;
  try {
    adminId = (await requireAdmin()).id;
  } catch {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const body = await request.json() as { id?: string; action?: "approve" | "reject"; plan?: string };
  if (!body.id || !["approve", "reject"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "Payment and action are required." }, { status: 400 });
  }
  if (body.action === "approve" && body.plan !== undefined && !isPaidPlan(body.plan)) {
    return NextResponse.json({ error: "Choose a valid plan." }, { status: 400 });
  }
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ManualPayment" WHERE id = ${body.id} FOR UPDATE`;
    const payment = await tx.manualPayment.findUnique({ where: { id: body.id } });
    if (!payment || payment.status !== "pending") return null;
    const now = new Date();
    if (body.action === "approve") {
      const plan = isPaidPlan(body.plan) ? body.plan : payment.plan;
      const billing = await tx.billingAccount.findUnique({ where: { userId: payment.userId } });
      if (billing?.stripeStatus === "active" && billing.stripePeriodEnd && billing.stripePeriodEnd > now) {
        return { error: "This account has an active card subscription." };
      }
      if (billing?.manualPeriodEnd && billing.manualPeriodEnd > now) {
        return { error: "This account already has an active QR plan." };
      }
      const end = new Date(now);
      end.setUTCMonth(end.getUTCMonth() + 1);
      await tx.billingAccount.upsert({
        where: { userId: payment.userId },
        create: { userId: payment.userId, manualPaymentId: payment.id, manualPlan: plan, manualPeriodStart: now, manualPeriodEnd: end },
        update: { manualPaymentId: payment.id, manualPlan: plan, manualPeriodStart: now, manualPeriodEnd: end }
      });
      await tx.manualPayment.update({ where: { id: payment.id }, data: { plan } });
    }
    await tx.manualPayment.update({
      where: { id: payment.id },
      data: { status: body.action === "approve" ? "approved" : "rejected", reviewedAt: now, reviewedById: adminId }
    });
    return { ok: true };
  });
  return result && "error" in result
    ? NextResponse.json({ error: result.error }, { status: 409 })
    : result ? NextResponse.json(result) : NextResponse.json({ error: "Payment is no longer pending." }, { status: 409 });
}
