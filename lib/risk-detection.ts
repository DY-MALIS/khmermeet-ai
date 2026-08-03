export type MeetingRisk = {
  kind: "no_deadline" | "no_owner" | "unclear_decision" | "overdue_task" | "open_question";
  message: string;
};

type RiskTask = { title: string; assigneeName: string | null; deadline: Date | null; status: string };
type RiskDecision = { title: string; ownerName: string | null; deadline: Date | null; status: string };

// Pure/derived - deliberately not AI or stored, so it never goes stale
// relative to the tasks/decisions it inspects.
export function computeMeetingRisks(
  tasks: RiskTask[],
  decisions: RiskDecision[],
  openQuestions: string[],
  now: Date = new Date()
): MeetingRisk[] {
  const risks: MeetingRisk[] = [];

  for (const task of tasks) {
    if (task.status === "completed") continue;
    if (!task.deadline) risks.push({ kind: "no_deadline", message: `"${task.title}" has no deadline.` });
    if (!task.assigneeName) risks.push({ kind: "no_owner", message: `"${task.title}" is not assigned to anyone.` });
    if (task.deadline && task.deadline < now) risks.push({ kind: "overdue_task", message: `"${task.title}" is overdue.` });
  }

  for (const decision of decisions) {
    if (decision.status === "pending" && !decision.ownerName) {
      risks.push({ kind: "unclear_decision", message: `Decision "${decision.title}" has no clear owner yet.` });
    }
  }

  for (const question of openQuestions) {
    risks.push({ kind: "open_question", message: `Open question: "${question}"` });
  }

  return risks;
}
