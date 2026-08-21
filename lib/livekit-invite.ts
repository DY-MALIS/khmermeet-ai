import { createHmac, timingSafeEqual } from "crypto";

export function cleanRoomName(value: unknown) {
  const room = typeof value === "string" ? value.trim().toUpperCase() : "";
  return room.replace(/[^A-Z0-9_-]/g, "").slice(0, 64);
}

function inviteSecret() {
  return process.env.NEXTAUTH_SECRET || process.env.LIVEKIT_API_SECRET || "khmermeet-local-invite-secret";
}

function signInvite(room: string, expiresAt: number) {
  return createHmac("sha256", inviteSecret()).update(`${room}.${expiresAt}`).digest("base64url");
}

export function createInviteToken(room: string) {
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
  return `${room}.${expiresAt}.${signInvite(room, expiresAt)}`;
}

export function verifyInviteToken(roomValue: unknown, value: unknown) {
  const room = cleanRoomName(roomValue);
  if (!room || typeof value !== "string") return false;
  const [tokenRoom, expiresAtText, signature] = value.split(".");
  const expiresAt = Number(expiresAtText);
  if (tokenRoom !== room || !Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;

  const expected = Buffer.from(signInvite(room, expiresAt));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
