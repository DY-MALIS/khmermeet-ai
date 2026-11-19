import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  const user = await requireUser();
  const form = await request.formData();
  const transactionRef = String(form.get("transactionRef") ?? "").trim();
  if (transactionRef.length < 4 || transactionRef.length > 100) {
    return NextResponse.json({ error: "Enter a valid transaction reference." }, { status: 400 });
  }
  const pending = await prisma.manualPayment.findFirst({ where: { userId: user.id, status: "pending" }, select: { id: true } });
  if (pending) return NextResponse.json({ error: "Your payment is already waiting for review." }, { status: 409 });

  const receiptValue = form.get("receipt");
  const receipt = receiptValue instanceof File && receiptValue.size > 0 ? receiptValue : null;
  if (receipt && (!IMAGE_TYPES.has(receipt.type) || receipt.size > MAX_RECEIPT_BYTES)) {
    return NextResponse.json({ error: "Receipt must be a PNG, JPG, or WebP image smaller than 5 MB." }, { status: 400 });
  }
  try {
    await prisma.manualPayment.create({
      data: {
        userId: user.id,
        transactionRef,
        receipt: receipt ? Buffer.from(await receipt.arrayBuffer()) : null,
        receiptMimeType: receipt?.type ?? null
      }
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That transaction reference was already submitted." }, { status: 409 });
  }
}
