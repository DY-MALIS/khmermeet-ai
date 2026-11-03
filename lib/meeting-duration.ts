export const MAX_MEETING_DURATION_SECONDS = 12 * 60 * 60;
export const MAX_MEETING_DURATION_MS = MAX_MEETING_DURATION_SECONDS * 1000;
// Guests need time to upload and register their recordings after a full call.
export const LIVE_RECORDING_REGISTRATION_WINDOW_MS = MAX_MEETING_DURATION_MS + 60 * 60 * 1000;

export function isRecentLiveMeeting(meeting: { status: string; createdAt: Date } | null) {
  if (!meeting || !["recording", "recorded", "transcribed", "summarized"].includes(meeting.status)) return false;
  const ageMs = Date.now() - meeting.createdAt.getTime();
  return ageMs >= 0 && ageMs < LIVE_RECORDING_REGISTRATION_WINDOW_MS;
}

export function clampMeetingDurationSeconds(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(MAX_MEETING_DURATION_SECONDS, Math.max(0, Math.round(seconds)));
}

export function clampMeetingDurationMs(value: unknown) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return 0;
  return Math.min(MAX_MEETING_DURATION_MS, Math.max(0, Math.round(ms)));
}
