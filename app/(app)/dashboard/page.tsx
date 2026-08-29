/* eslint-disable @next/next/no-html-link-for-pages */
import { ArrowRight, CheckCircle2, Clock, FileAudio, Mic, ListTodo, Plus, Radio, Video, Wand2 } from "lucide-react";
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
    { label: text.totalMeetings, value: meetings.length, icon: FileAudio, tone: "bg-leaf/10 text-leaf", accent: "bg-leaf" },
    { label: text.totalTasks, value: tasks.length, icon: ListTodo, tone: "bg-sky/10 text-sky", accent: "bg-sky" },
    { label: text.completedStat, value: tasks.filter((task) => task.status === "completed").length, icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700", accent: "bg-emerald-500" },
    { label: text.overdueStat, value: tasks.filter((task) => task.deadline && task.deadline < now && task.status !== "completed").length, icon: Clock, tone: "bg-red-100 text-red-700", accent: "bg-red-500" }
  ];

  const qualityScores = meetings
    .map((meeting) => computeMeetingQualityScore(meeting.tasks, meeting.decisions, Boolean(meeting.summary)))
    .filter((score): score is number => score !== null);
  const avgQualityScore = qualityScores.length ? Math.round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length) : null;
  const completionRate = computeTaskCompletionRate(tasks);
  const avgMeetingMinutes = computeAverageMeetingMinutes(meetings);
  const speakingTime = computeSpeakingTimeBySpeaker(segments).slice(0, 5);
  const pendingTasks = tasks.filter((task) => task.status !== "completed");
  const overdueTasks = tasks.filter((task) => task.deadline && task.deadline < now && task.status !== "completed");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-leaf/15 bg-gradient-to-r from-emerald-50 via-teal-50 to-amber-50/70 p-4 shadow-xl shadow-leaf/10 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-xs font-bold uppercase text-leaf">{text.welcome}</p>
          <h1 className="mt-1 text-3xl font-black tracking-normal text-ink sm:text-4xl">{text.dashboardTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Record meetings, upload audio, and turn Khmer or English speech into organized notes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/meetings/new" className="kh-button-primary">
            <Plus className="h-4 w-4" />
            Start now
          </a>
          <a href="/meetings/call" className="kh-button-secondary">
            <Video className="h-4 w-4" />
            Open call
          </a>
        </div>
      </div>
      <section className="grid items-start gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <a href="/meetings/new" className="group relative self-start overflow-hidden rounded-2xl border border-leaf/20 bg-gradient-to-br from-emerald-100/85 via-teal-50 to-sky-100/80 p-6 shadow-2xl shadow-leaf/20 transition hover:-translate-y-0.5 hover:shadow-leaf/25 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-leaf via-sky to-saffron" />
          <div className="absolute right-6 top-6 hidden rounded-full border border-leaf/20 bg-white/75 px-3 py-2 text-xs font-bold text-leaf shadow-sm xl:block">
            Live capture ready
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-leaf text-white shadow-lg shadow-leaf/30">
                <Mic className="h-6 w-6" />
              </span>
                <div>
                  <p className="text-xs font-bold uppercase text-leaf">{text.primaryFeature}</p>
                  <h2 className="text-2xl font-black text-ink sm:text-4xl">{text.startMeetingRecording}</h2>
                </div>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
                {text.dashboardRecordDescription}
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-leaf/10 px-3 py-2 text-leaf shadow-sm ring-1 ring-leaf/15">Audio</span>
                <span className="rounded-full bg-sky/10 px-3 py-2 text-sky shadow-sm ring-1 ring-sky/15">Transcript</span>
                <span className="rounded-full bg-saffron/15 px-3 py-2 text-saffron shadow-sm ring-1 ring-saffron/20">Summary</span>
              </div>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-leaf px-5 py-3 text-sm font-bold text-white shadow-lg shadow-leaf/30 transition group-hover:bg-sky">
              Start recording
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
          </div>
        </a>
        <div className="grid gap-4">
          <a href="/meetings/call" className="group rounded-2xl border border-sky/20 bg-sky-50/85 p-5 shadow-xl shadow-sky/10 backdrop-blur-xl transition hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky/10 text-sky shadow-sm ring-1 ring-sky/10">
                <Video className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-500">Video meeting</p>
                <h2 className="text-xl font-bold text-ink">{text.openVideoMeeting}</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">{text.dashboardVideoDescription}</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/80 px-4 py-2 text-sm font-bold text-ink shadow-sm ring-1 ring-sky/10 transition group-hover:text-sky">
              Open call
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
          </a>
          <div className="rounded-2xl border border-saffron/25 bg-gradient-to-br from-amber-50 via-orange-50/60 to-emerald-50 p-5 shadow-xl shadow-saffron/10 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-leaf/10 text-leaf shadow-sm">
                <Radio className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase text-leaf">Today</p>
                <p className="font-bold text-ink">{pendingTasks.length} pending tasks</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              {overdueTasks.length ? `${overdueTasks.length} overdue items need review.` : "No overdue pressure right now."}
            </p>
          </div>
        </div>
      </section>
      {dbUnavailable ? (
        <div className="rounded-lg border border-saffron/30 bg-saffron/10 p-4 text-sm text-ink">
          {text.dashboardDbUnavailable}
        </div>
      ) : null}
      {!dbUnavailable ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div className="kh-card relative overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-50/80 p-5 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-leaf/15" key={stat.label}>
            <div className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} />
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <span className={`rounded-xl p-2 ${stat.tone}`}><stat.icon className="h-5 w-5" /></span>
            </div>
            <p className="mt-4 text-3xl font-bold text-ink">{stat.value}</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-leaf" style={{ width: `${Math.max(8, Math.min(100, Number(stat.value) * 5 || 8))}%` }} />
            </div>
          </div>
        ))}
      </div> : null}
      {!dbUnavailable ? (
        <section className="kh-card overflow-hidden bg-emerald-50/80 p-0 shadow-xl shadow-leaf/10">
          <div className="border-b border-leaf/10 bg-gradient-to-r from-emerald-100/80 via-teal-50 to-sky-50 px-5 py-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-leaf">Insights</p>
              <h2 className="text-lg font-bold text-ink">AI Meeting Analytics</h2>
            </div>
            <Wand2 className="h-5 w-5 text-saffron" />
          </div>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
            <AnalyticsTile label="Meeting Quality" value={avgQualityScore !== null ? `${avgQualityScore}%` : "-"} tone="leaf" />
            <AnalyticsTile label="Task completion" value={completionRate !== null ? `${completionRate}%` : "-"} tone="sky" />
            <AnalyticsTile label="Late tasks" value={String(tasks.filter((task) => task.deadline && task.deadline < now && task.status !== "completed").length)} tone="saffron" />
            <AnalyticsTile label="Average meeting time" value={avgMeetingMinutes ? `${avgMeetingMinutes} min` : "-"} tone="ink" />
          </div>
          {speakingTime.length ? (
            <div className="px-5 pb-5">
              <p className="mb-2 text-sm font-bold text-ink">Who talks most (Server Rec recordings)</p>
              <div className="space-y-2">
                {speakingTime.map((speaker) => {
                  const maxSeconds = speakingTime[0].seconds || 1;
                  return (
                    <div key={speaker.name} className="flex items-center gap-3 rounded-xl border border-leaf/10 bg-white/70 px-3 py-2 shadow-sm">
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
      {!dbUnavailable ? <div className="grid gap-5 xl:grid-cols-2">
        <section className="kh-card overflow-hidden bg-teal-50/70">
          <div className="border-b border-leaf/10 bg-gradient-to-r from-emerald-100/70 to-teal-50 px-5 py-4">
            <h2 className="text-lg font-bold">{text.recentMeetings}</h2>
          </div>
          <div className="p-5">
          {meetings.length ? (
            <div className="space-y-3">
              {meetings.slice(0, 5).map((meeting) => (
                <a href={`/meetings/${meeting.id}`} key={meeting.id} className="group block rounded-xl border border-leaf/10 bg-white/65 p-3 transition hover:border-leaf/25 hover:bg-white/85 hover:shadow-sm">
                  <p className="break-words font-semibold text-ink group-hover:text-leaf">{meeting.title}</p>
                  <p className="text-sm text-slate-500">{meeting.createdAt.toLocaleDateString()} · {meeting.tasks.length} {text.tasksCount}</p>
                </a>
              ))}
            </div>
          ) : <EmptyState title={text.noMeetingsYet} description={text.noMeetingsYetDescription} />}
          </div>
        </section>
        <section className="kh-card overflow-hidden bg-sky-50/65">
          <div className="border-b border-sky/10 bg-gradient-to-r from-sky-100/70 to-emerald-50 px-5 py-4">
            <h2 className="text-lg font-bold">{text.pendingTasks}</h2>
          </div>
          <div className="p-5">
          {tasks.filter((task) => task.status !== "completed").length ? (
            <div className="space-y-3">
              {pendingTasks.slice(0, 6).map((task) => (
                <div key={task.id} className="rounded-xl border border-sky/10 bg-white/65 p-3">
                  <p className="break-words font-semibold text-ink">{task.title}</p>
                  <p className="text-sm text-slate-500">{task.assigneeName ?? text.unassigned} · {task.deadline?.toLocaleDateString() ?? text.noDueDate}</p>
                </div>
              ))}
            </div>
          ) : <EmptyState title={text.noPendingTasks} description={text.noPendingTasksDescription} />}
          </div>
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
    <div className="rounded-xl border border-leaf/10 bg-white/65 p-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-md">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full w-2/3 rounded-full ${toneClass}`} />
      </div>
    </div>
  );
}
