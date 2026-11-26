import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function cambodiaDay(now: Date) {
  const day = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00.000Z`);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ error: "Telegram bot is not configured." }, { status: 503 });
  const dueOn = cambodiaDay(new Date());
  const nextDay = new Date(dueOn.getTime() + 86400_000);
  const connections = await prisma.telegramConnection.findMany({ where: { enabled: true } });
  let sent = 0;
  let failed = 0;
  for (const connection of connections) {
    const tasks = await prisma.task.findMany({
      where: {
        meeting: { createdById: connection.userId },
        deadline: { gte: dueOn, lt: nextDay },
        status: { not: "completed" }
      },
      include: { meeting: { select: { title: true } } }
    });
    for (const task of tasks) {
      // Reserve the task and date before sending. A network timeout is left as
      // failed for manual review; an automatic retry could duplicate a message.
      const claimed = await prisma.telegramReminder.create({
        data: { userId: connection.userId, taskId: task.id, dueOn }
      }).then(() => true).catch((error: { code?: string }) => {
        if (error.code === "P2002") return false;
        throw error;
      });
      if (!claimed) continue;
      try {
        await sendTelegramMessage(connection.chatId, `រំលឹកកិច្ចការថ្ងៃនេះ៖ ${task.title}\nកិច្ចប្រជុំ៖ ${task.meeting.title}`);
        await prisma.telegramReminder.update({ where: { taskId_dueOn: { taskId: task.id, dueOn } }, data: { status: "sent" } });
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 200) : "Telegram delivery failed.";
        await prisma.telegramReminder.update({ where: { taskId_dueOn: { taskId: task.id, dueOn } }, data: { status: "failed", error: message } });
        await prisma.telegramConnection.update({ where: { userId: connection.userId }, data: { lastError: message } });
        failed += 1;
      }
    }
  }
  return NextResponse.json({ ok: true, sent, failed });
}
