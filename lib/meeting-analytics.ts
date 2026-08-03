type AnalyticsMeeting = { duration: number; summary: string | null };
type AnalyticsTask = { status: string; deadline: Date | null; assigneeName: string | null };
type AnalyticsDecision = { status: string };
type AnalyticsSegment = { speakerName: string | null; speakerIdentity: string; startMs: number; endMs: number };

// Derived, not stored - always reflects current tasks/decisions instead of
// going stale like a saved score would.
export function computeMeetingQualityScore(tasks: AnalyticsTask[], decisions: AnalyticsDecision[], hasSummary: boolean) {
  const actionable = tasks.length + decisions.length;
  if (!actionable && !hasSummary) return null;

  let points = 0;
  let maxPoints = 0;

  maxPoints += 1;
  if (hasSummary) points += 1;

  for (const task of tasks) {
    maxPoints += 2;
    if (task.deadline) points += 1;
    if (task.assigneeName) points += 1;
  }
  for (const decision of decisions) {
    maxPoints += 1;
    if (decision.status !== "pending") points += 1;
  }

  return Math.round((points / Math.max(1, maxPoints)) * 100);
}

export function computeTaskCompletionRate(tasks: AnalyticsTask[]) {
  if (!tasks.length) return null;
  const completed = tasks.filter((task) => task.status === "completed").length;
  return Math.round((completed / tasks.length) * 100);
}

export function computeAverageMeetingMinutes(meetings: AnalyticsMeeting[]) {
  if (!meetings.length) return 0;
  const totalSeconds = meetings.reduce((sum, meeting) => sum + meeting.duration, 0);
  return Math.round(totalSeconds / meetings.length / 60);
}

export function computeSpeakingTimeBySpeaker(segments: AnalyticsSegment[]) {
  const totals = new Map<string, number>();
  for (const segment of segments) {
    const name = segment.speakerName || segment.speakerIdentity;
    totals.set(name, (totals.get(name) ?? 0) + Math.max(0, segment.endMs - segment.startMs));
  }
  return [...totals.entries()]
    .map(([name, ms]) => ({ name, seconds: Math.round(ms / 1000) }))
    .sort((a, b) => b.seconds - a.seconds);
}
