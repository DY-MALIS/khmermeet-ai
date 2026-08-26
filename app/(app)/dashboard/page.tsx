/* eslint-disable @next/next/no-html-link-for-pages */
import { CheckCircle2, Clock, FileAudio, Mic, ListTodo, Video } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePageUser } from "@/lib/session";
import { EmptyState } from "@/components/ui";
import { PersonalAssistant } from "@/components/personal-assistant";
import {
  computeAverageMeetingMinutes,
  computeMeetingQualityScore,
  computeSpeakingTimeBySpeaker,
  computeTaskCompletionRate
} from "@/lib/meeting-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const user = await requirePageUser();
  const data = await Promise.all([
    prisma.meeting.findMany({
      where: { createdById: user.id },
      include: { tasks: true, decisions: true },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.task.findMany({ where: { meeting: { createdById: user.id } }, include: { meeting: true }, orderBy: { createdAt: "desc" } }),
    prisma.meetingTranscriptSegment.findMany({
      where: { meeting: { createdById: user.id } },
      select: { speakerName: true, speakerIdentity: true, startMs: true, endMs: true },
      take: 5000
    })
  ])
    .then(([meetings, tasks, segments]) => ({ meetings, tasks, segments, dbUnavailable: false }))
    .catch(() => ({ meetings: [], tasks: [], segments: [], dbUnavailable: true }));
  const { meetings, tasks, segments, dbUnavailable } = data;
  const now = new Date();
  const stats = [
    { label: "ប្រជុំសរុប", value: meetings.length, icon: FileAudio, tone: "bg-leaf/10 text-leaf" },
    { label: "កិច្ចការសរុប", value: tasks.length, icon: ListTodo, tone: "bg-sky/10 text-sky" },
    { label: "បានបញ្ចប់", value: tasks.filter((task) => task.status === "completed").length, icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700" },
    { label: "ហួសកំណត់", value: tasks.filter((task) => task.deadline && task.deadline < now && task.status !== "completed").length, icon: Clock, tone: "bg-red-100 text-red-700" }
  ];

  const qualityScores = meetings
    .map((meeting) => computeMeetingQualityScore(meeting.tasks, meeting.decisions, Boolean(meeting.summary)))
    .filter((score): score is number => score !== null);
  const avgQualityScore = qualityScores.length ? Math.round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length) : null;
  const completionRate = computeTaskCompletionRate(tasks);
  const avgMeetingMinutes = computeAverageMeetingMinutes(meetings);
  const speakingTime = computeSpeakingTimeBySpeaker(segments).slice(0, 5);

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
          មិនអាចភ្ជាប់ production database បានទេ។ ស្ថិតិខាងក្រោមត្រូវបានផ្អាក ដើម្បីកុំឲ្យមើលច្រឡំថាទិន្នន័យបាត់។ សូមពិនិត្យ DATABASE_URL និង Supabase។
        </div>
      ) : null}
      {!dbUnavailable ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div className="kh-card p-5" key={stat.label}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <span className={`rounded-lg p-2 ${stat.tone}`}><stat.icon className="h-5 w-5" /></span>
            </div>
            <p className="mt-4 text-3xl font-bold text-ink">{stat.value}</p>
          </div>
        ))}
      </div> : null}
      {!dbUnavailable ? (
        <section className="kh-card p-5">
          <h2 className="mb-4 text-lg font-bold">AI Meeting Analytics</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AnalyticsTile label="Meeting Quality" value={avgQualityScore !== null ? `${avgQualityScore}%` : "-"} />
            <AnalyticsTile label="Task completion" value={completionRate !== null ? `${completionRate}%` : "-"} />
            <AnalyticsTile label="Late tasks" value={String(tasks.filter((task) => task.deadline && task.deadline < now && task.status !== "completed").length)} />
            <AnalyticsTile label="Average meeting time" value={avgMeetingMinutes ? `${avgMeetingMinutes} min` : "-"} />
          </div>
          {speakingTime.length ? (
            <div className="mt-5">
              <p className="mb-2 text-sm font-bold text-ink">Who talks most (Server Rec recordings)</p>
              <div className="space-y-2">
                {speakingTime.map((speaker) => {
                  const maxSeconds = speakingTime[0].seconds || 1;
                  return (
                    <div key={speaker.name} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-xs text-slate-600">{speaker.name}</span>
                      <div className="h-2 flex-1 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-leaf" style={{ width: `${Math.max(4, (speaker.seconds / maxSeconds) * 100)}%` }} />
                      </div>
                      <span className="w-14 shrink-0 text-right text-xs text-slate-500">{Math.round(speaker.seconds / 60)} min</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      {!dbUnavailable ? <PersonalAssistant /> : null}
      {!dbUnavailable ? <div className="grid gap-6 xl:grid-cols-2">
        <section className="kh-card p-5">
          <h2 className="mb-4 text-lg font-bold">ប្រជុំថ្មីៗ</h2>
          {meetings.length ? (
            <div className="space-y-3">
              {meetings.slice(0, 5).map((meeting) => (
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
      </div> : null}
    </div>
  );
}

function AnalyticsTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

