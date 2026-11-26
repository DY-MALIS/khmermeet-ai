import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { telegramLinkHash, validTelegramWebhookSecret } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramUpdate = {
  message?: { text?: string; chat?: { id?: number; type?: string } };
};

export async function POST(request: Request) {
  if (!validTelegramWebhookSecret(request.headers.get("X-Telegram-Bot-Api-Secret-Token"))) {
    return NextResponse.json({ error: "Invalid Telegram webhook secret." }, { status: 401 });
  }
  const update = await request.json().catch(() => null) as TelegramUpdate | null;
  const message = update?.message;
  const token = /^\/start ([A-Za-z0-9_-]{32})$/.exec(message?.text ?? "")?.[1];
  if (!token || message?.chat?.type !== "private" || !Number.isSafeInteger(message.chat.id)) {
    return NextResponse.json({ ok: true });
  }
  const link = await prisma.telegramLink.findUnique({ where: { tokenHash: telegramLinkHash(token) } });
  if (!link || link.expiresAt <= new Date()) return NextResponse.json({ ok: true });
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.telegramLink.deleteMany({ where: { userId: link.userId, tokenHash: link.tokenHash, expiresAt: { gt: new Date() } } });
    if (!consumed.count) return;
    await tx.telegramConnection.upsert({
      where: { userId: link.userId },
      create: { userId: link.userId, chatId: String(message.chat!.id) },
      update: { chatId: String(message.chat!.id), enabled: true, connectedAt: new Date(), lastError: null }
    });
  });
  return NextResponse.json({ ok: true });
}
