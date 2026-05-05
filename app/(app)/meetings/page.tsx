import Link from "next/link";
import { Search, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { deleteMeeting } from "@/lib/actions";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui";

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ q?: string; date?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const meetings = await prisma.meeting.findMany({
    where: {
      createdById: user.id,
      title: params.q ? { contains: params.q, mode: "insensitive" } : undefined,
      createdAt: params.date ? { gte: new Date(params.date), lt: new Date(new Date(params.date).getTime() + 86400000) } : undefined
    },
    include: { tasks: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">រកមើលកិច្ចប្រជុំ</p>
        <h1 className="text-3xl font-bold text-ink">ប្រវត្តិប្រជុំ</h1>
      </div>
      <form className="kh-card grid gap-3 p-4 sm:grid-cols-[1fr_220px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="kh-input pl-9" name="q" defaultValue={params.q} placeholder="ស្វែងរកតាមចំណងជើង" />
        </div>
        <input className="kh-input" name="date" type="date" defaultValue={params.date} />
        <button className="kh-button-primary">ស្វែងរក</button>
      </form>
      {meetings.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {meetings.map((meeting) => (
            <article className="kh-card p-5" key={meeting.id}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <Link href={`/meetings/${meeting.id}`} className="text-lg font-bold text-ink hover:text-leaf">{meeting.title}</Link>
                <form action={deleteMeeting}>
                  <input type="hidden" name="id" value={meeting.id} />
                  <ActionButton className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></ActionButton>
                </form>
              </div>
              <p className="text-sm text-slate-500">{meeting.createdAt.toLocaleDateString()} · {Math.round(meeting.duration / 60)} នាទី</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="kh-badge bg-leaf/10 text-leaf">{meeting.status}</span>
                <span className="kh-badge bg-slate-100 text-slate-600">{meeting.tasks.length} tasks</span>
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState title="រកមិនឃើញប្រជុំ" description="សាកល្បងស្វែងរកពាក្យផ្សេង ឬបង្កើតប្រជុំថ្មី។" />}
    </div>
  );
}
