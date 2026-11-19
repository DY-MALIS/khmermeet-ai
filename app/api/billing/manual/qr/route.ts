import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET() {
  await requireUser();
  const settings = await prisma.billingSettings.findUnique({ where: { id: "default" } });
  if (!settings) return NextResponse.json({ error: "Payment QR has not been configured." }, { status: 404 });
  return new NextResponse(Uint8Array.from(settings.qrImage), {
    headers: {
      "Content-Type": settings.qrMimeType,
      "Cache-Control": "private, no-store"
    }
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File) || !IMAGE_TYPES.has(image.type) || image.size === 0 || image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Choose a PNG, JPG, or WebP image smaller than 5 MB." }, { status: 400 });
  }
  const payeeName = String(form.get("payeeName") ?? "").trim().slice(0, 100) || null;
  const merchantId = String(form.get("merchantId") ?? "").trim().slice(0, 100) || null;
  const qrImage = Buffer.from(await image.arrayBuffer());
  await prisma.billingSettings.upsert({
    where: { id: "default" },
    create: { id: "default", qrImage, qrMimeType: image.type, payeeName, merchantId },
    update: { qrImage, qrMimeType: image.type, payeeName, merchantId }
  });
  return NextResponse.json({ ok: true });
}
