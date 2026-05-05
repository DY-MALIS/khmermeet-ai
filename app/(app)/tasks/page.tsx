import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { deleteTask, updateTask } from "@/lib/actions";
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">គ្រប់គ្រង action items</p>
        <h1 className="text-3xl font-bold text-ink">កិច្ចការ</h1>
      </div>
      {dbUnavailable ? (
        <div className="rounded-lg border border-saffron/30 bg-saffron/10 p-4 text-sm text-ink">
          Database មិនទាន់ដំណើរការ។ ទំព័រនេះបើកបានហើយ ប៉ុន្តែ list/update/delete tasks ត្រូវការ local database។
        </div>
      ) : null}
      <form className="kh-card grid gap-3 p-4 md:grid-cols-4">
        <select className="kh-input" name="status" defaultValue={params.status ?? ""}>
          <option value="">គ្រប់ស្ថានភាព</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
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
      </form>
      <section className="kh-card overflow-hidden">
        {tasks.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Meeting</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Deadline</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
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
                      <input form={`update-${task.id}`} className="kh-input min-w-36" name="deadline" type="date" defaultValue={task.deadline?.toISOString().slice(0, 10) ?? ""} />
                    </td>
                    <td className="px-4 py-3"><span className="kh-badge bg-sky/10 text-sky">{task.priority}</span></td>
                    <td className="px-4 py-3">
                      <select form={`update-${task.id}`} className="kh-input min-w-40" name="status" defaultValue={task.status}>
                        <option value="not_started">Not started</option>
                        <option value="in_progress">In progress</option>
                        <option value="completed">Completed</option>
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
        ) : <div className="p-5"><EmptyState title="រកមិនឃើញកិច្ចការ" description="កិច្ចការដែល AI ដកស្រង់នឹងបង្ហាញនៅទីនេះ។" /></div>}
      </section>
    </div>
  );
}
