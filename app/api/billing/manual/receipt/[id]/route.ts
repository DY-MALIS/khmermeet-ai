import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const { id } = await context.params;
  const payment = await prisma.manualPayment.findUnique({
    where: { id },
    select: { receipt: true, receiptMimeType: true }
  });
  if (!payment?.receipt || !payment.receiptMimeType) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  return new NextResponse(Uint8Array.from(payment.receipt), {
    headers: { "Content-Type": payment.receiptMimeType, "Cache-Control": "private, no-store" }
  });
}
