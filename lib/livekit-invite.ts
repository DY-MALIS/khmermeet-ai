import { createHmac, timingSafeEqual } from "crypto";
import { MAX_MEETING_DURATION_MS } from "@/lib/meeting-duration";

// This token is what lets a no-account guest join a call, request an upload
// ticket, and register their finished recording - so it has to stay valid
// for as long as a call this app supports can actually run. It was 2h, which
// is shorter than the 12h meeting cap: on a longer call a guest could not
// reconnect after a network drop, and worse, their own recording upload at
// the end was rejected outright, silently losing the audio the meeting
// existed to capture. The extra hour past the cap covers the upload and
// registration that happen just after a maximum-length call ends.
const INVITE_TOKEN_LIFETIME_MS = MAX_MEETING_DURATION_MS + 60 * 60 * 1000;

export function cleanRoomName(value: unknown) {
  const room = typeof value === "string" ? value.trim().toUpperCase() : "";
  return room.replace(/[^A-Z0-9_-]/g, "").slice(0, 64);
}

// Signing key for guest invite links. This used to prefer NEXTAUTH_SECRET,
// a leftover from the auth system removed in ba5ab16 that only still works
// because the variable happens to remain set in production - deleting that
// dead variable would have silently invalidated every invite link already
// out there, locking guests out of calls in progress. Signing now uses
// LIVEKIT_API_SECRET, which is present anywhere calls work at all.
function inviteSigningSecret() {
  return process.env.LIVEKIT_API_SECRET || "khmermeet-local-invite-secret";
}

// Keys a signature is still *accepted* under, so links minted before the
// switch above keep working for their full lifetime and NEXTAUTH_SECRET can
// be removed from the environment whenever without a breakage window.
function acceptedInviteSecrets() {
  return [inviteSigningSecret(), process.env.NEXTAUTH_SECRET].filter(
    (secret): secret is string => Boolean(secret)
  );
}

function signInviteWith(secret: string, room: string, expiresAt: number) {
  return createHmac("sha256", secret).update(`${room}.${expiresAt}`).digest("base64url");
}

export function createInviteToken(room: string) {
  const expiresAt = Date.now() + INVITE_TOKEN_LIFETIME_MS;
  return `${room}.${expiresAt}.${signInviteWith(inviteSigningSecret(), room, expiresAt)}`;
}

export function verifyInviteToken(roomValue: unknown, value: unknown) {
  const room = cleanRoomName(roomValue);
  if (!room || typeof value !== "string") return false;
  const [tokenRoom, expiresAtText, signature] = value.split(".");
  const expiresAt = Number(expiresAtText);
  if (tokenRoom !== room || !Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;

  const actual = Buffer.from(signature);
  // Every candidate is compared even after a match so the work done doesn't
  // depend on which key matched.
  return acceptedInviteSecrets().reduce((matched, secret) => {
    const expected = Buffer.from(signInviteWith(secret, room, expiresAt));
    const equal = expected.length === actual.length && timingSafeEqual(expected, actual);
    return matched || equal;
  }, false);
}
