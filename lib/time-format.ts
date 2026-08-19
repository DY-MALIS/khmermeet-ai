import { clampMeetingDurationSeconds } from "@/lib/meeting-duration";

export function formatMeetingDuration(seconds: number) {
  const safeSeconds = clampMeetingDurationSeconds(seconds);
  if (safeSeconds < 60) return `${safeSeconds} វិនាទី`;

  if (safeSeconds >= 3600) {
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainingSeconds = safeSeconds % 60;
    return [
      `${hours} ម៉ោង`,
      minutes ? `${minutes} នាទី` : "",
      remainingSeconds ? `${remainingSeconds} វិនាទី` : ""
    ].filter(Boolean).join(" ");
  }

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (!remainingSeconds) return `${minutes} នាទី`;

  return `${minutes} នាទី ${remainingSeconds} វិនាទី`;
}
