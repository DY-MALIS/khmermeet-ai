import Link from "next/link";
import { CalendarClock, ListTodo, MessagesSquare, ScrollText } from "lucide-react";
import { prisma } from "@/lib/prisma";

export async function NextMeetingPrep({ userId }: { userId: string }) {
  const lastMeeting = await prisma.meeting
    .findFirst({
      where: { createdById: userId, transcript: { not: null } },
      orderBy: { createdAt: "desc" },
      include: {
        tasks: { where: { status: { not: "completed" } }, orderBy: { createdAt: "desc" }, take: 6 },
        decisions: { where: { status: { not: "done" } }, orderBy: { createdAt: "desc" }, take: 6 }
      }
    })
    .catch(() => null);

  if (!lastMeeting) return null;

  const smartNote = lastMeeting.smartNote as { questions?: string[] } | null;
  const openQuestions = smartNote?.questions ?? [];
  const hasCarryover = lastMeeting.tasks.length > 0 || lastMeeting.decisions.length > 0 || openQuestions.length > 0;

  if (!hasCarryover && !lastMeeting.summary) return null;

  return (
    <section className="kh-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-leaf">
          <CalendarClock className="h-4 w-4" />
          AI Next Meeting Preparation
        </p>
        <Link className="text-xs font-semibold text-leaf hover:underline" href={`/meetings/${lastMeeting.id}`}>
          Open last meeting: {lastMeeting.title}
        </Link>
      </div>

      {lastMeeting.summary ? (
        <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs leading-6 text-slate-600">
          <p className="mb-1 flex items-center gap-1 font-bold text-ink">
            <ScrollText className="h-3.5 w-3.5" />
            Previous summary
          </p>
          <p className="line-clamp-4 whitespace-pre-wrap">{lastMeeting.summary}</p>
        </div>
      ) : null}

      {lastMeeting.tasks.length ? (
        <div className="mb-3">
          <p className="mb-1 flex items-center gap-1 text-xs font-bold text-ink">
            <ListTodo className="h-3.5 w-3.5" />
            Pending tasks ({lastMeeting.tasks.length})
          </p>
          <ul className="space-y-1 text-xs text-slate-600">
            {lastMeeting.tasks.map((task) => (
              <li key={task.id}>• {task.title} {task.assigneeName ? `(${task.assigneeName})` : ""}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {lastMeeting.decisions.length ? (
        <div className="mb-3">
          <p className="mb-1 text-xs font-bold text-ink">Unfinished decisions ({lastMeeting.decisions.length})</p>
          <ul className="space-y-1 text-xs text-slate-600">
            {lastMeeting.decisions.map((decision) => (
              <li key={decision.id}>• {decision.title}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {openQuestions.length ? (
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-bold text-ink">
            <MessagesSquare className="h-3.5 w-3.5" />
            Open questions
          </p>
          <ul className="space-y-1 text-xs text-slate-600">
            {openQuestions.slice(0, 5).map((question, index) => (
              <li key={index}>• {question}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
