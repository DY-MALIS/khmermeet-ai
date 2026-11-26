import { createHash, timingSafeEqual } from "node:crypto";

export function telegramLinkHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function validTelegramWebhookSecret(header: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !header) return false;
  const actual = Buffer.from(header);
  const desired = Buffer.from(expected);
  return actual.length === desired.length && timingSafeEqual(actual, desired);
}

export async function sendTelegramMessage(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram bot is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10000)
  });
  const result = await response.json().catch(() => ({})) as { ok?: boolean; description?: string };
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram returned ${response.status}.`);
}
