import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { telegramLinkHash } from "@/lib/telegram";

export async function POST() {
  const user = await requireUser();
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username || !/^[A-Za-z0-9_]{5,32}$/.test(username) || !process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Telegram reminders are not configured." }, { status: 503 });
  }
  const token = randomBytes(24).toString("base64url");
  await prisma.telegramLink.upsert({
    where: { userId: user.id },
    create: { userId: user.id, tokenHash: telegramLinkHash(token), expiresAt: new Date(Date.now() + 10 * 60_000) },
    update: { tokenHash: telegramLinkHash(token), expiresAt: new Date(Date.now() + 10 * 60_000) }
  });
  return NextResponse.json({ url: `https://t.me/${username}?start=${token}` });
}
