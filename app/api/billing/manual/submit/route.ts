import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isPaidPlan } from "@/lib/billing-plans";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  if (!isPaidPlan(body.plan)) return NextResponse.json({ error: "Choose a valid plan." }, { status: 400 });
  const pending = await prisma.manualPayment.findFirst({ where: { userId: user.id, status: "pending" }, select: { id: true } });
  if (pending) return NextResponse.json({ error: "Your payment is already waiting for review." }, { status: 409 });

  const payment = await prisma.manualPayment.create({
    data: { userId: user.id, plan: body.plan, transactionRef: `request-${randomUUID()}` },
    select: { id: true }
  });
  return NextResponse.json({ ok: true, requestId: payment.id }, { status: 201 });
}
