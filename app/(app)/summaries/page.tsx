import { Bot, CheckSquare, Lightbulb, ListChecks } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { EmptyState } from "@/components/ui";
import { SummaryDisplay } from "@/components/summary-display";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SummariesPage() {
  const user = await requireUser();
  const data = await prisma.meeting
    .findMany({
      where: {
        createdById: user.id,
        OR: [{ summary: { not: null } }, { transcript: { not: null } }]
      },
      include: { tasks: true },
      orderBy: { updatedAt: "desc" },
      take: 20
    })
    .then((meetings) => ({ meetings, dbUnavailable: false }))
    .catch(() => ({ meetings: [], dbUnavailable: true }));
  const { meetings, dbUnavailable } = data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">AI Summary</p>
        <h1 className="text-3xl font-bold text-ink">សង្ខេបដោយ AI</h1>
        <p className="mt-2 text-sm text-slate-500">សង្ខេបប្រជុំ, ចំណុចសំខាន់ៗ, ការសម្រេចចិត្ត និងកិច្ចការដែលត្រូវធ្វើ។</p>
      </div>
      {dbUnavailable ? (
        <div className="rounded-lg border border-saffron/30 bg-saffron/10 p-4 text-sm text-ink">
          មិនអាចភ្ជាប់ production database បានទេ។ Summary មិនត្រូវបានចាត់ទុកថាបានលុបទេ។ សូមពិនិត្យ DATABASE_URL និង Supabase។
        </div>
      ) : null}
      {!dbUnavailable && meetings.length ? (
        <div className="space-y-4">
          {meetings.map((meeting) => (
            <article className="kh-card p-5" key={meeting.id}>
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf/10 text-leaf">
                    <Bot className="h-5 w-5" />
                  </span>
                  <div>
                    <a href={`/meetings/${meeting.id}`} className="text-lg font-bold text-ink hover:text-leaf">
                      {meeting.title}
                    </a>
                    <p className="text-sm text-slate-500">{meeting.updatedAt.toLocaleString()}</p>
                  </div>
                </div>
                <span className="kh-badge bg-sky/10 text-sky">{meeting.tasks.length} action items</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
                    <Lightbulb className="h-4 w-4 text-saffron" />
                    សង្ខេបប្រជុំ និងចំណុចសំខាន់ៗ
                  </p>
                  {meeting.summary ? (
                    <SummaryDisplay summary={meeting.summary} />
                  ) : (
                    <p className="text-sm text-slate-500">មិនទាន់មាន summary។ ប្រើ Summary Agent ខាងលើ ដើម្បីបញ្ជាឲ្យសង្ខេបពី transcript។</p>
                  )}
                </div>
                <div className="rounded-lg border border-slate-100 p-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
                    <ListChecks className="h-4 w-4 text-leaf" />
                    កិច្ចការដែលត្រូវធ្វើ
                  </p>
                  {meeting.tasks.length ? (
                    <div className="space-y-3">
                      {meeting.tasks.slice(0, 4).map((task) => (
                        <div className="rounded-lg bg-slate-50 p-3" key={task.id}>
                          <p className="flex items-start gap-2 font-semibold text-ink">
                            <CheckSquare className="mt-0.5 h-4 w-4 text-leaf" />
                            {task.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {task.assigneeName ?? "មិនទាន់កំណត់អ្នកទទួល"} · {task.deadline?.toLocaleDateString() ?? "គ្មាន deadline"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">មិនទាន់មាន action items។</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : !dbUnavailable ? (
        <EmptyState title="មិនទាន់មានសង្ខេបដោយ AI" description="បញ្ចូល transcript រួចចុច Generate AI Summary ឬប្រើ Meeting Agent។" />
      ) : null}
    </div>
  );
}
