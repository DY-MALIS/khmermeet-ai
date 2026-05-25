export function formatMeetingDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  if (safeSeconds < 60) return `${safeSeconds} វិនាទី`;

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (!remainingSeconds) return `${minutes} នាទី`;

  return `${minutes} នាទី ${remainingSeconds} វិនាទី`;
}
