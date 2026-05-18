/* eslint-disable @next/next/no-html-link-for-pages */
import { CheckCircle2, Clock, FileAudio, Mic, ListTodo, Video } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await Promise.all([
    prisma.meeting.findMany({ where: { createdById: user.id }, include: { tasks: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.task.findMany({ where: { meeting: { createdById: user.id } }, include: { meeting: true }, orderBy: { createdAt: "desc" } })
  ])
    .then(([meetings, tasks]) => ({ meetings, tasks, dbUnavailable: false }))
    .catch(() => ({ meetings: [], tasks: [], dbUnavailable: true }));
  const { meetings, tasks, dbUnavailable } = data;
  const now = new Date();
  const stats = [
    { label: "ប្រជុំសរុប", value: meetings.length, icon: FileAudio, tone: "bg-leaf/10 text-leaf" },
    { label: "កិច្ចការសរុប", value: tasks.length, icon: ListTodo, tone: "bg-sky/10 text-sky" },
    { label: "បានបញ្ចប់", value: tasks.filter((task) => task.status === "completed").length, icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700" },
    { label: "ហួសកំណត់", value: tasks.filter((task) => task.deadline && task.deadline < now && task.status !== "completed").length, icon: Clock, tone: "bg-red-100 text-red-700" }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-leaf">សូមស្វាគមន៍</p>
          <h1 className="text-3xl font-bold text-ink">ផ្ទាំងគ្រប់គ្រង</h1>
        </div>
      </div>
      <section className="kh-card overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_.8fr]">
          <a href="/meetings/new" className="group block bg-leaf p-6 text-white transition hover:bg-leaf/95">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-white/15">
                <Mic className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white/80">មុខងារសំខាន់</p>
                <h2 className="text-2xl font-bold">ចាប់ផ្តើមថតប្រជុំ</h2>
              </div>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/80">
              ថតសំឡេងប្រជុំ, បញ្ចូល transcript, បង្កើតសង្ខេបដោយ AI និងដកស្រង់ action items។
            </p>
          </a>
          <a href="/meetings/call" className="group block border-t border-black/5 bg-white p-6 transition hover:bg-slate-50 lg:border-l lg:border-t-0">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-sky/10 text-sky">
                <Video className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-500">Video meeting</p>
                <h2 className="text-xl font-bold text-ink">បើកប្រជុំវីដេអូ</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">ចូល video call ហើយឲ្យ Meeting Agent ថតសំឡេង និងរក្សា transcript ស្វ័យប្រវត្តិ។</p>
          </a>
        </div>
      </section>
      {dbUnavailable ? (
        <div className="rounded-lg border border-saffron/30 bg-saffron/10 p-4 text-sm text-ink">
          Database មិនទាន់ដំណើរការ។ App shell បើកបានហើយ ប៉ុន្តែការរក្សាទុកប្រជុំ/កិច្ចការត្រូវការ local database និង Prisma setup។
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div className="kh-card p-5" key={stat.label}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <span className={`rounded-lg p-2 ${stat.tone}`}><stat.icon className="h-5 w-5" /></span>
            </div>
            <p className="mt-4 text-3xl font-bold text-ink">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="kh-card p-5">
          <h2 className="mb-4 text-lg font-bold">ប្រជុំថ្មីៗ</h2>
          {meetings.length ? (
            <div className="space-y-3">
              {meetings.map((meeting) => (
                <a href={`/meetings/${meeting.id}`} key={meeting.id} className="block rounded-lg border border-slate-100 p-3 hover:bg-slate-50">
                  <p className="font-semibold text-ink">{meeting.title}</p>
                  <p className="text-sm text-slate-500">{meeting.createdAt.toLocaleDateString()} · {meeting.tasks.length} កិច្ចការ</p>
                </a>
              ))}
            </div>
          ) : <EmptyState title="មិនទាន់មានប្រជុំ" description="ចាប់ផ្តើមថត ឬបង្កើតប្រជុំថ្មី។" />}
        </section>
        <section className="kh-card p-5">
          <h2 className="mb-4 text-lg font-bold">កិច្ចការកំពុងរង់ចាំ</h2>
          {tasks.filter((task) => task.status !== "completed").length ? (
            <div className="space-y-3">
              {tasks.filter((task) => task.status !== "completed").slice(0, 6).map((task) => (
                <div key={task.id} className="rounded-lg border border-slate-100 p-3">
                  <p className="font-semibold text-ink">{task.title}</p>
                  <p className="text-sm text-slate-500">{task.assigneeName ?? "មិនទាន់កំណត់អ្នកទទួល"} · {task.deadline?.toLocaleDateString() ?? "គ្មានថ្ងៃកំណត់"}</p>
                </div>
              ))}
            </div>
          ) : <EmptyState title="គ្មានកិច្ចការរង់ចាំ" description="កិច្ចការថ្មីនឹងបង្ហាញនៅទីនេះ។" />}
        </section>
      </div>
    </div>
  );
}
