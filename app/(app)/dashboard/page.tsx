/* eslint-disable @next/next/no-html-link-for-pages */
import { ArrowRight, CheckCircle2, Clock, FileAudio, Mic, ListTodo, Sparkles, Video } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { meetingOwnerWhere, ownerWhere, requireUser } from "@/lib/session";
import { EmptyState } from "@/components/ui";
import { PersonalAssistant } from "@/components/personal-assistant";
import { getServerUiText } from "@/lib/server-ui-text";
import {
  computeAverageMeetingMinutes,
  computeMeetingQualityScore,
  computeSpeakingTimeBySpeaker,
  computeTaskCompletionRate
} from "@/lib/meeting-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const user = await requireUser();
  const { text } = await getServerUiText();
  const data = await Promise.all([
    prisma.meeting.findMany({
      where: ownerWhere(user),
      include: { tasks: true, decisions: true },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.task.findMany({ where: meetingOwnerWhere(user), include: { meeting: true }, orderBy: { createdAt: "desc" } }),
    prisma.meetingTranscriptSegment.findMany({
      where: meetingOwnerWhere(user),
      select: { speakerName: true, speakerIdentity: true, startMs: true, endMs: true },
      take: 5000
    })
  ])
    .then(([meetings, tasks, segments]) => ({ meetings, tasks, segments, dbUnavailable: false }))
    .catch(() => ({ meetings: [], tasks: [], segments: [], dbUnavailable: true }));
  const { meetings, tasks, segments, dbUnavailable } = data;
  const now = new Date();
  const stats = [
    { label: text.totalMeetings, value: meetings.length, icon: FileAudio, tone: "bg-leaf/10 text-leaf" },
    { label: text.totalTasks, value: tasks.length, icon: ListTodo, tone: "bg-sky/10 text-sky" },
    { label: text.completedStat, value: tasks.filter((task) => task.status === "completed").length, icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700" },
    { label: text.overdueStat, value: tasks.filter((task) => task.deadline && task.deadline < now && task.status !== "completed").length, icon: Clock, tone: "bg-red-100 text-red-700" }
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
          <p className="text-sm font-semibold text-leaf">{text.welcome}</p>
          <h1 className="mt-1 text-4xl font-black tracking-normal text-ink sm:text-5xl">{text.dashboardTitle}</h1>
        </div>
        <div className="hidden items-center gap-2 rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm backdrop-blur sm:flex">
          <Sparkles className="h-4 w-4 text-saffron" />
          <span>AI meeting tracker</span>
        </div>
      </div>
      <section className="kh-card overflow-hidden shadow-2xl shadow-slate-900/10">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_.8fr]">
          <a href="/meetings/new" className="group relative block overflow-hidden bg-ink p-6 text-white transition hover:bg-ink/95 sm:p-8">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-leaf via-sky to-saffron" />
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-white/12 shadow-lg shadow-black/20 ring-1 ring-white/15">
                <Mic className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white/70">{text.primaryFeature}</p>
                <h2 className="text-2xl font-bold sm:text-3xl">{text.startMeetingRecording}</h2>
              </div>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/80">
              {text.dashboardRecordDescription}
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-ink shadow-sm transition group-hover:bg-slate-100">
              Start now
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
          </a>
          <a href="/meetings/call" className="group block border-t border-slate-200 bg-white/95 p-6 transition hover:bg-white sm:p-8 lg:border-l lg:border-t-0">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-sky/10 text-sky shadow-sm ring-1 ring-sky/10">
                <Video className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-500">Video meeting</p>
                <h2 className="text-xl font-bold text-ink">{text.openVideoMeeting}</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">{text.dashboardVideoDescription}</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-ink shadow-sm transition group-hover:border-slate-300">
              Open call
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
          </a>
        </div>
      </section>
      {dbUnavailable ? (
        <div className="rounded-lg border border-saffron/30 bg-saffron/10 p-4 text-sm text-ink">
          {text.dashboardDbUnavailable}
        </div>
      ) : null}
      {!dbUnavailable ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div className="kh-card p-5 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/10" key={stat.label}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <span className={`rounded-lg p-2 ${stat.tone}`}><stat.icon className="h-5 w-5" /></span>
            </div>
            <p className="mt-4 text-3xl font-bold text-ink">{stat.value}</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-leaf" style={{ width: `${Math.max(8, Math.min(100, Number(stat.value) * 5 || 8))}%` }} />
            </div>
          </div>
        ))}
      </div> : null}
      {!dbUnavailable ? (
        <section className="kh-card p-5 shadow-xl shadow-slate-900/5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-leaf">Insights</p>
              <h2 className="text-lg font-bold text-ink">AI Meeting Analytics</h2>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AnalyticsTile label="Meeting Quality" value={avgQualityScore !== null ? `${avgQualityScore}%` : "-"} tone="leaf" />
            <AnalyticsTile label="Task completion" value={completionRate !== null ? `${completionRate}%` : "-"} tone="sky" />
            <AnalyticsTile label="Late tasks" value={String(tasks.filter((task) => task.deadline && task.deadline < now && task.status !== "completed").length)} tone="saffron" />
            <AnalyticsTile label="Average meeting time" value={avgMeetingMinutes ? `${avgMeetingMinutes} min` : "-"} tone="ink" />
          </div>
          {speakingTime.length ? (
            <div className="mt-5">
              <p className="mb-2 text-sm font-bold text-ink">Who talks most (Server Rec recordings)</p>
              <div className="space-y-2">
                {speakingTime.map((speaker) => {
                  const maxSeconds = speakingTime[0].seconds || 1;
                  return (
                    <div key={speaker.name} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white/80 px-3 py-2 shadow-sm">
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
          <h2 className="mb-4 text-lg font-bold">{text.recentMeetings}</h2>
          {meetings.length ? (
            <div className="space-y-3">
              {meetings.slice(0, 5).map((meeting) => (
                <a href={`/meetings/${meeting.id}`} key={meeting.id} className="block rounded-lg border border-slate-100 bg-slate-50/50 p-3 transition hover:border-slate-200 hover:bg-white hover:shadow-sm">
                  <p className="font-semibold text-ink">{meeting.title}</p>
                  <p className="text-sm text-slate-500">{meeting.createdAt.toLocaleDateString()} · {meeting.tasks.length} {text.tasksCount}</p>
                </a>
              ))}
            </div>
          ) : <EmptyState title={text.noMeetingsYet} description={text.noMeetingsYetDescription} />}
        </section>
        <section className="kh-card p-5">
          <h2 className="mb-4 text-lg font-bold">{text.pendingTasks}</h2>
          {tasks.filter((task) => task.status !== "completed").length ? (
            <div className="space-y-3">
              {tasks.filter((task) => task.status !== "completed").slice(0, 6).map((task) => (
                <div key={task.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                  <p className="font-semibold text-ink">{task.title}</p>
                  <p className="text-sm text-slate-500">{task.assigneeName ?? text.unassigned} · {task.deadline?.toLocaleDateString() ?? text.noDueDate}</p>
                </div>
              ))}
            </div>
          ) : <EmptyState title={text.noPendingTasks} description={text.noPendingTasksDescription} />}
        </section>
      </div> : null}
    </div>
  );
}

function AnalyticsTile({ label, value, tone }: { label: string; value: string; tone: "leaf" | "sky" | "saffron" | "ink" }) {
  const toneClass = {
    leaf: "bg-leaf",
    sky: "bg-sky",
    saffron: "bg-saffron",
    ink: "bg-ink"
  }[tone];
  return (
    <div className="rounded-lg border border-slate-100 bg-white/80 p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full w-2/3 rounded-full ${toneClass}`} />
      </div>
    </div>
  );
}
