import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export async function GET(request: Request) {
  await requireUser();
  return NextResponse.redirect(new URL("/payment-qr-malis-dy.png", request.url));
}

export async function POST() {
  const user = await requireUser();
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  return NextResponse.json({ error: "Payment QR is managed in the deployed site assets." }, { status: 409 });
}
