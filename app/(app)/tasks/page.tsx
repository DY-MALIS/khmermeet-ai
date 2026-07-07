import Link from "next/link";
import { CalendarClock, Plus, Trash2, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { createTask, deleteTask, updateTask } from "@/lib/actions";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui";

type TaskPriority = "low" | "medium" | "high";
type TaskStatus = "not_started" | "in_progress" | "completed";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ status?: string; priority?: string; overdue?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const now = new Date();
  const data = await prisma.task
    .findMany({
      where: {
        meeting: { createdById: user.id },
        status: params.status ? (params.status as TaskStatus) : undefined,
        priority: params.priority ? (params.priority as TaskPriority) : undefined,
        deadline: params.overdue === "true" ? { lt: now } : undefined,
        NOT: params.overdue === "true" ? { status: "completed" } : undefined
      },
      include: { meeting: true },
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }]
    })
    .then((tasks) => ({ tasks, dbUnavailable: false }))
    .catch(() => ({ tasks: [], dbUnavailable: true }));
  const { tasks, dbUnavailable } = data;
  const meetings = await prisma.meeting
    .findMany({
      where: { createdById: user.id },
      orderBy: { createdAt: "desc" },
      take: 30
    })
    .catch(() => []);
  const hasActiveFilters = Boolean(params.status || params.priority || params.overdue);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">Action Tracker</p>
        <h1 className="text-3xl font-bold text-ink">កិច្ចការដែលត្រូវធ្វើ</h1>
        <p className="mt-2 text-sm text-slate-500">តាមដានអ្នកទទួលខុសត្រូវ, deadline និងស្ថានភាពការងារ។</p>
      </div>
      {dbUnavailable ? (
        <div className="rounded-lg border border-saffron/30 bg-saffron/10 p-4 text-sm text-ink">
          មិនអាចភ្ជាប់ production database បានទេ។ កិច្ចការមិនត្រូវបានចាត់ទុកថាបានលុបទេ។ សូមពិនិត្យ DATABASE_URL និង Supabase រួចសាកម្តងទៀត។
        </div>
      ) : null}
      {!dbUnavailable ? <section className="kh-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-leaf/10 text-leaf">
            <Plus className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-bold text-ink">បង្កើតកិច្ចការថ្មី</h2>
            <p className="text-xs text-slate-500">បើ AI មិនទាន់ដក task បាន អ្នកអាចបង្កើតដោយដៃនៅទីនេះ។</p>
          </div>
        </div>
        {meetings.length ? (
          <form action={createTask} className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_160px_160px_auto]">
            <select className="kh-input" name="meetingId" required>
              {meetings.map((meeting) => (
                <option key={meeting.id} value={meeting.id}>
                  {meeting.title}
                </option>
              ))}
            </select>
            <input className="kh-input" name="title" placeholder="ចំណងជើងកិច្ចការ" required />
            <input className="kh-input" name="assigneeName" placeholder="អ្នកទទួលខុសត្រូវ" />
            <input className="kh-input" name="deadline" type="date" />
            <select className="kh-input" name="priority" defaultValue="medium">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <ActionButton className="kh-button-primary">
              <Plus className="h-4 w-4" />
              បង្កើត
            </ActionButton>
            <textarea className="kh-input min-h-20 lg:col-span-6" name="description" placeholder="ពិពណ៌នាកិច្ចការ..." />
          </form>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center">
            <p className="font-semibold text-ink">មិនទាន់មាន meeting សម្រាប់ភ្ជាប់ task</p>
            <p className="mt-1 text-sm text-slate-500">សូមថតប្រជុំ ឬបង្កើត meeting មុន បន្ទាប់មកត្រឡប់មកបង្កើត task។</p>
            <Link className="kh-button-secondary mt-3" href="/meetings/new">បង្កើត meeting</Link>
          </div>
        )}
      </section> : null}
      <form className="kh-card grid gap-3 p-4 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <select className="kh-input" name="status" defaultValue={params.status ?? ""}>
          <option value="">គ្រប់ស្ថានភាព</option>
          <option value="not_started">មិនទាន់ចាប់ផ្តើម</option>
          <option value="in_progress">កំពុងធ្វើ</option>
          <option value="completed">រួច</option>
        </select>
        <select className="kh-input" name="priority" defaultValue={params.priority ?? ""}>
          <option value="">គ្រប់អាទិភាព</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <select className="kh-input" name="overdue" defaultValue={params.overdue ?? ""}>
          <option value="">ទាំងអស់</option>
          <option value="true">Overdue only</option>
        </select>
        <button className="kh-button-primary">Filter</button>
        {hasActiveFilters ? (
          <Link className="kh-button-secondary justify-center" href="/tasks">
            Show all
          </Link>
        ) : null}
      </form>
      {!dbUnavailable ? <section className="kh-card overflow-hidden">
        {tasks.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">កិច្ចការ</th>
                  <th className="px-4 py-3">ប្រជុំ</th>
                  <th className="px-4 py-3"><span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />អ្នកទទួលខុសត្រូវ</span></th>
                  <th className="px-4 py-3">Deadline</th>
                  <th className="px-4 py-3">អាទិភាព</th>
                  <th className="px-4 py-3">ស្ថានភាព</th>
                  <th className="px-4 py-3">រក្សាទុក</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task) => (
                  <tr key={task.id} className={task.deadline && task.deadline < now && task.status !== "completed" ? "bg-red-50/50" : ""}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{task.title}</p>
                      <p className="text-xs text-slate-500">{task.description}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{task.meeting.title}</td>
                    <td className="px-4 py-3">
                      <form id={`update-${task.id}`} action={updateTask} className="contents">
                        <input type="hidden" name="id" value={task.id} />
                        <input className="kh-input min-w-40" name="assigneeName" defaultValue={task.assigneeName ?? ""} />
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-slate-400" />
                        <input form={`update-${task.id}`} className="kh-input min-w-36" name="deadline" type="date" defaultValue={task.deadline?.toISOString().slice(0, 10) ?? ""} />
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="kh-badge bg-sky/10 text-sky">{task.priority}</span></td>
                    <td className="px-4 py-3">
                      <select form={`update-${task.id}`} className="kh-input min-w-40" name="status" defaultValue={task.status}>
                        <option value="not_started">មិនទាន់ចាប់ផ្តើម</option>
                        <option value="in_progress">កំពុងធ្វើ</option>
                        <option value="completed">រួច</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <ActionButton className="kh-button-primary" form={`update-${task.id}`}>Save</ActionButton>
                        <form action={deleteTask}>
                          <input type="hidden" name="id" value={task.id} />
                          <ActionButton className="kh-button-secondary text-red-600"><Trash2 className="h-4 w-4" /></ActionButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              title={hasActiveFilters ? "រកមិនឃើញកិច្ចការតាម filter" : "មិនទាន់មានកិច្ចការ"}
              description={
                hasActiveFilters
                  ? "សូមចុច Show all ឬប្ដូរ filter ដើម្បីមើលកិច្ចការផ្សេងៗ។"
                  : "កិច្ចការដែល AI ដកស្រង់ ឬអ្នកបង្កើតដោយដៃ នឹងបង្ហាញនៅទីនេះ។"
              }
            />
            {hasActiveFilters ? (
              <div className="mt-4 text-center">
                <Link className="kh-button-primary inline-flex" href="/tasks">
                  Show all tasks
                </Link>
              </div>
            ) : null}
          </div>
        )}
      </section> : null}
    </div>
  );
}
