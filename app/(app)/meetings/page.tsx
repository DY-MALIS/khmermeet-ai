import { Search, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { deleteMeeting } from "@/lib/actions";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui";
import { formatMeetingDuration } from "@/lib/time-format";
import { getServerUiText } from "@/lib/server-ui-text";
import { ownerWhere } from "@/lib/session";
import type { Prisma } from "@prisma/client";

type MeetingWithTasks = Prisma.MeetingGetPayload<{ include: { tasks: true } }>;

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ q?: string; date?: string }> }) {
  const user = await requireUser();
  const { text } = await getServerUiText();
  const params = await searchParams;
  const data = await prisma.meeting
    .findMany({
      where: {
        ...ownerWhere(user),
        title: params.q ? { contains: params.q } : undefined,
        createdAt: params.date ? { gte: new Date(params.date), lt: new Date(new Date(params.date).getTime() + 86400000) } : undefined
      },
      include: { tasks: true },
      orderBy: { createdAt: "desc" }
    })
    .then((meetings) => ({ meetings, dbUnavailable: false }))
    .catch(() => ({ meetings: [] as MeetingWithTasks[], dbUnavailable: true }));
  const { meetings, dbUnavailable } = data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">{text.meetingHistoryEyebrow}</p>
        <h1 className="text-3xl font-bold text-ink">{text.meetingHistoryTitle}</h1>
      </div>
      {dbUnavailable ? (
        <div className="rounded-lg border border-saffron/30 bg-saffron/10 p-4 text-sm text-ink">
          {text.dbUnavailable}
        </div>
      ) : null}
      <form className="kh-card grid gap-3 p-4 sm:grid-cols-[1fr_220px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="kh-input pl-9" name="q" defaultValue={params.q} placeholder={text.meetingSearchPlaceholder} />
        </div>
        <input className="kh-input" name="date" type="date" defaultValue={params.date} />
        <button className="kh-button-primary">{text.search}</button>
      </form>
      {!dbUnavailable && meetings.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {meetings.map((meeting) => (
            <article className="kh-card p-5" key={meeting.id}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <a href={`/meetings/${meeting.id}`} className="text-lg font-bold text-ink hover:text-leaf">{meeting.title}</a>
                <form action={deleteMeeting}>
                  <input type="hidden" name="id" value={meeting.id} />
                  <ActionButton className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></ActionButton>
                </form>
              </div>
              <p className="text-sm text-slate-500">{meeting.createdAt.toLocaleDateString()} · {formatMeetingDuration(meeting.duration)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="kh-badge bg-leaf/10 text-leaf">{meeting.status}</span>
                <span className="kh-badge bg-slate-100 text-slate-600">{meeting.tasks.length} {text.tasksCount}</span>
              </div>
            </article>
          ))}
        </div>
      ) : !dbUnavailable ? <EmptyState title={text.noMeetingsFound} description={text.noMeetingsFoundDescription} /> : null}
    </div>
  );
}
