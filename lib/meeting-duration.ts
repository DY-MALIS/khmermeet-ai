export const MAX_MEETING_DURATION_SECONDS = 12 * 60 * 60;
export const MAX_MEETING_DURATION_MS = MAX_MEETING_DURATION_SECONDS * 1000;

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
