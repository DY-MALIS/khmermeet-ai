import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const providers = ["google", "slack", "zoom"] as const;
export type Provider = (typeof providers)[number];

export function isProvider(value: string): value is Provider {
  return providers.includes(value as Provider);
}

function encryptionKey() {
  const key = Buffer.from(process.env.INTEGRATION_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("Integration encryption key is not configured.");
  return key;
}

export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(value: string) {
  const [iv, tag, bytes] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !bytes || iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted token.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(bytes), decipher.final()]).toString("utf8");
}

export function oauthStateHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function providerCredentials(provider: Provider) {
  const prefix = provider.toUpperCase();
  const id = process.env[`${prefix}_CLIENT_ID`];
  const secret = process.env[`${prefix}_CLIENT_SECRET`];
  const appUrl = process.env.APP_URL;
  if (!id || !secret || !appUrl || !/^https:\/\//.test(appUrl) && !/^http:\/\/localhost(?::\d+)?$/.test(appUrl)) {
    throw new Error(`${provider} OAuth is not configured.`);
  }
  return { id, secret, redirectUri: `${appUrl.replace(/\/$/, "")}/api/integrations/${provider}/callback` };
}

export function authorizationUrl(provider: Provider, state: string) {
  const { id, redirectUri } = providerCredentials(provider);
  const base = provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth"
    : provider === "slack" ? "https://slack.com/oauth/v2/authorize" : "https://zoom.us/oauth/authorize";
  const url = new URL(base);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (provider === "google") {
    url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  } else if (provider === "slack") {
    url.searchParams.set("scope", "chat:write,channels:read");
  }
  return url;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; team?: { id?: string }; error?: string; ok?: boolean };

async function tokenRequest(provider: Provider, body: URLSearchParams) {
  const { id, secret } = providerCredentials(provider);
  const endpoint = provider === "google" ? "https://oauth2.googleapis.com/token"
    : provider === "slack" ? "https://slack.com/api/oauth.v2.access" : "https://zoom.us/oauth/token";
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (provider === "slack" || provider === "zoom") headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  else {
    body.set("client_id", id);
    body.set("client_secret", secret);
  }
  const response = await fetch(endpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(10000) });
  const result = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || (provider === "slack" && result.ok !== true) || !result.access_token) {
    throw new Error(`${provider} authorization failed: ${result.error ?? response.status}.`);
  }
  return result;
}

export async function exchangeAuthorizationCode(provider: Provider, code: string) {
  const { redirectUri } = providerCredentials(provider);
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  return tokenRequest(provider, body);
}

export async function saveConnection(userId: string, provider: Provider, token: TokenResponse) {
  if (!token.access_token) throw new Error("Provider token is missing.");
  const existing = await prisma.integrationConnection.findUnique({ where: { userId_provider: { userId, provider } } });
  await prisma.integrationConnection.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      userId, provider, accessToken: encryptToken(token.access_token),
      refreshToken: token.refresh_token ? encryptToken(token.refresh_token) : null,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      externalAccount: token.team?.id ?? null
    },
    update: {
      accessToken: encryptToken(token.access_token),
      refreshToken: token.refresh_token ? encryptToken(token.refresh_token) : existing?.refreshToken,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      externalAccount: token.team?.id ?? existing?.externalAccount ?? null
    }
  });
}

export async function providerAccessToken(userId: string, provider: Provider) {
  const connection = await prisma.integrationConnection.findUnique({ where: { userId_provider: { userId, provider } } });
  if (!connection) throw new Error(`${provider} is not connected.`);
  if (!connection.expiresAt || connection.expiresAt.getTime() > Date.now() + 60_000) return decryptToken(connection.accessToken);
  if (!connection.refreshToken || provider === "slack") throw new Error(`${provider} needs to be reconnected.`);
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: decryptToken(connection.refreshToken) });
  const token = await tokenRequest(provider, body);
  await saveConnection(userId, provider, token);
  return token.access_token!;
}
