import assert from "node:assert/strict";
import test from "node:test";
import { sendTelegramMessage, telegramLinkHash, validTelegramWebhookSecret } from "./telegram";
import { cambodiaDay } from "../app/api/cron/telegram-reminders/route";

test("Telegram webhook only accepts the configured secret", () => {
  const previous = process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret-value";
  try {
    assert.equal(validTelegramWebhookSecret("test-secret-value"), true);
    assert.equal(validTelegramWebhookSecret("test-secret-valuE"), false);
    assert.equal(validTelegramWebhookSecret(null), false);
  } finally {
    if (previous === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = previous;
  }
});

test("Telegram link tokens are stored as stable non-reversible hashes", () => {
  assert.equal(telegramLinkHash("token") === "token", false);
  assert.equal(telegramLinkHash("token"), telegramLinkHash("token"));
  assert.notEqual(telegramLinkHash("token"), telegramLinkHash("other"));
});

test("Cambodia reminder day crosses UTC midnight correctly", () => {
  assert.equal(cambodiaDay(new Date("2026-11-25T16:59:59Z")).toISOString(), "2026-11-25T00:00:00.000Z");
  assert.equal(cambodiaDay(new Date("2026-11-25T17:00:00Z")).toISOString(), "2026-11-26T00:00:00.000Z");
});

test("Telegram delivery failure is reported without sending a real message", async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  let requested = false;
  globalThis.fetch = async (_url, init) => {
    requested = true;
    assert.equal(JSON.parse(String(init?.body)).chat_id, "12345");
    return Response.json({ ok: false, description: "chat not found" }, { status: 400 });
  };
  try {
    await assert.rejects(sendTelegramMessage("12345", "test"), /chat not found/);
    assert.equal(requested, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousToken;
  }
});
