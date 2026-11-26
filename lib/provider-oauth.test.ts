import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { authorizationUrl, decryptToken, encryptToken, oauthStateHash } from "./provider-oauth";

test("provider tokens are encrypted with a different nonce each time", () => {
  const prior = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  try {
    const first = encryptToken("private-token");
    const second = encryptToken("private-token");
    assert.notEqual(first, second);
    assert.equal(decryptToken(first), "private-token");
    const parts = first.split(".");
    const tampered = Buffer.from(parts[2], "base64url");
    tampered[0] ^= 1;
    parts[2] = tampered.toString("base64url");
    assert.throws(() => decryptToken(parts.join(".")));
  } finally { if (prior === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY; else process.env.INTEGRATION_ENCRYPTION_KEY = prior; }
});

test("OAuth state is hashed and Google Calendar requests explicit consent", () => {
  const prior = { APP_URL: process.env.APP_URL, GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET };
  process.env.APP_URL = "https://example.com";
  process.env.GOOGLE_CLIENT_ID = "client";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  try {
    assert.notEqual(oauthStateHash("secret-state"), "secret-state");
    const url = authorizationUrl("google", "secret-state");
    assert.equal(url.searchParams.get("redirect_uri"), "https://example.com/api/integrations/google/callback");
    assert.equal(url.searchParams.get("prompt"), "consent");
    assert.match(url.searchParams.get("scope") ?? "", /calendar\.events/);
  } finally { for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
