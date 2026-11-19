import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

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
  const payments = await prisma.manualPayment.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      transactionRef: true,
      receiptMimeType: true,
      createdAt: true,
      user: { select: { name: true, email: true } }
    }
  });
  return NextResponse.json({ payments });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const body = await request.json() as { id?: string; action?: "approve" | "reject" };
  if (!body.id || !["approve", "reject"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "Payment and action are required." }, { status: 400 });
  }
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.manualPayment.findUnique({ where: { id: body.id } });
    if (!payment || payment.status !== "pending") return null;
    const now = new Date();
    if (body.action === "approve") {
      const end = new Date(now);
      end.setUTCMonth(end.getUTCMonth() + 1);
      await tx.billingAccount.upsert({
        where: { userId: payment.userId },
        create: { userId: payment.userId, manualPaymentId: payment.id, manualPeriodStart: now, manualPeriodEnd: end },
        update: { manualPaymentId: payment.id, manualPeriodStart: now, manualPeriodEnd: end }
      });
    }
    await tx.manualPayment.update({
      where: { id: payment.id },
      data: { status: body.action === "approve" ? "approved" : "rejected", reviewedAt: now }
    });
    return { ok: true };
  });
  return result ? NextResponse.json(result) : NextResponse.json({ error: "Payment is no longer pending." }, { status: 409 });
}
