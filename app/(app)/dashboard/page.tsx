/* eslint-disable @next/next/no-html-link-for-pages */
import { ArrowRight, CheckCircle2, Clock, FileAudio, Mic, ListTodo, Plus, Radio, Video, Wand2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { meetingOwnerWhere, ownerWhere, requireUser } from "@/lib/session";
import { EmptyState } from "@/components/ui";
import { PersonalAssistant } from "@/components/personal-assistant";
import { DashboardBillingCard } from "@/components/dashboard-billing-card";
import { getServerUiText } from "@/lib/server-ui-text";
import { getUsageQuota } from "@/lib/usage-quota";
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
  const uiPromise = getServerUiText();
  const quotaPromise = getUsageQuota(user.id);
  const dataPromise = Promise.all([
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
  const [{ language, text }, quota, data] = await Promise.all([uiPromise, quotaPromise, dataPromise]);
  const t = (km: string, en: string) => language === "km" ? km : en;
  const { meetings, tasks, segments, dbUnavailable } = data;
  const now = new Date();
  const stats = [
    { label: text.totalMeetings, value: meetings.length, icon: FileAudio, tone: "bg-[#e0f5ed] text-[#087862]", accent: "bg-[#087862]" },
    { label: text.totalTasks, value: tasks.length, icon: ListTodo, tone: "bg-[#e2f2ef] text-[#0b7a70]", accent: "bg-[#0b7a70]" },
    { label: text.completedStat, value: tasks.filter((task) => task.status === "completed").length, icon: CheckCircle2, tone: "bg-[#e7f5e7] text-[#3e7e4b]", accent: "bg-[#3e7e4b]" },
    { label: text.overdueStat, value: tasks.filter((task) => task.deadline && task.deadline < now && task.status !== "completed").length, icon: Clock, tone: "bg-[#fff2dc] text-[#9b690d]", accent: "bg-[#e5ad33]" }
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
      <div className="relative flex flex-col gap-5 overflow-hidden rounded-[1.75rem] bg-gradient-to-r from-[#073f39] via-[#075b4e] to-[#0b8b6c] p-6 text-white shadow-xl shadow-[#073f39]/15 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-28 h-64 w-64 rounded-full border-[42px] border-white/5" />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#f5cb3f]">{text.welcome}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{text.dashboardTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/85">
            {t("ថតប្រជុំ ផ្ទុកសំឡេង និងបំលែងការនិយាយជាខ្មែរ ឬអង់គ្លេសទៅជាកំណត់ត្រាមានរបៀប។", "Record meetings, upload audio, and turn Khmer or English speech into organized notes.")}
          </p>
        </div>
        <div className="relative flex flex-wrap gap-2">
          <a href="/meetings/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#075b4e] shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-emerald-50">
            <Plus className="h-4 w-4" />
            {t("ចាប់ផ្ដើមឥឡូវ", "Start now")}
          </a>
          <a href="/meetings/call" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20">
            <Video className="h-4 w-4" />
            {t("បើកការហៅ", "Open call")}
          </a>
        </div>
      </div>
      {user.isAdmin && <a href="/settings#manual-payments" className="inline-flex min-h-11 items-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 font-bold text-emerald-800">{t("គ្រប់គ្រងការបង់ប្រាក់តាមអ៊ីមែល", "Manage payments by email")}</a>}
      <DashboardBillingCard quota={{
        ...quota,
        periodEnd: quota.periodEnd.toISOString(),
        manualPaymentCreatedAt: quota.manualPaymentCreatedAt?.toISOString() ?? null
      }} language={language} />
      <section className="grid items-start gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <a href="/meetings/new" className="group relative self-start overflow-hidden rounded-[1.5rem] border border-[#d3e7df] bg-[#fbfdf9] p-6 shadow-lg shadow-[#073f39]/8 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#073f39]/12 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#087862] via-[#0cb288] to-[#f5cb3f]" />
          <div className="absolute right-6 top-6 hidden rounded-full border border-[#cde6da] bg-[#e8f6ef] px-3 py-2 text-xs font-bold text-[#087862] xl:block">
            {t("រួចរាល់សម្រាប់ថតផ្ទាល់", "Live capture ready")}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#087862] text-white shadow-lg shadow-[#087862]/20">
                <Mic className="h-6 w-6" />
              </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#087862]">{text.primaryFeature}</p>
                  <h2 className="text-2xl font-black text-ink sm:text-4xl">{text.startMeetingRecording}</h2>
                </div>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
                {text.dashboardRecordDescription}
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-[#e1f3eb] px-3 py-2 text-[#087862] ring-1 ring-[#cde6da]">{t("សំឡេង", "Audio")}</span>
                <span className="rounded-full bg-[#e8f3ef] px-3 py-2 text-[#0a6e63] ring-1 ring-[#d3e7df]">{t("អត្ថបទប្រជុំ", "Transcript")}</span>
                <span className="rounded-full bg-[#fff4dc] px-3 py-2 text-[#9a680c] ring-1 ring-[#f5e6b9]">{t("សេចក្ដីសង្ខេប", "Summary")}</span>
              </div>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#087862] px-5 py-3 text-sm font-bold text-white shadow-md shadow-[#087862]/20 transition group-hover:bg-[#065d50]">
              {t("ចាប់ផ្ដើមថត", "Start recording")}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
          </div>
        </a>
        <div className="grid gap-4">
          <a href="/meetings/call" className="group rounded-[1.5rem] border border-[#d3e7df] bg-white p-5 shadow-lg shadow-[#073f39]/8 transition hover:-translate-y-0.5 hover:shadow-xl">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e1f3eb] text-[#087862]">
                <Video className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-500">{text.videoMeeting}</p>
                <h2 className="text-xl font-bold text-ink">{text.openVideoMeeting}</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">{text.dashboardVideoDescription}</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#cde6da] bg-[#f2faf5] px-4 py-2 text-sm font-bold text-[#075b4e] transition group-hover:bg-[#e1f3eb]">
              {t("បើកការហៅ", "Open call")}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
          </a>
          <div className="rounded-[1.5rem] border border-[#f2dfad] bg-[#fffaf0] p-5 shadow-lg shadow-[#a46f1a]/8">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-leaf/10 text-leaf shadow-sm">
                <Radio className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase text-leaf">{t("ថ្ងៃនេះ", "Today")}</p>
                <p className="font-bold text-ink">{pendingTasks.length} {t("កិច្ចការមិនទាន់បញ្ចប់", "pending tasks")}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              {overdueTasks.length ? t(`មានកិច្ចការហួសកំណត់ ${overdueTasks.length} ដែលត្រូវពិនិត្យ។`, `${overdueTasks.length} overdue items need review.`) : t("មិនមានកិច្ចការហួសកំណត់ទេ។", "No overdue tasks right now.")}
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
          <div className="relative overflow-hidden rounded-[1.4rem] border border-[#dbe9df] bg-white p-5 shadow-sm shadow-[#073f39]/5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#073f39]/10" key={stat.label}>
            <div className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <span className={`rounded-xl p-2 ${stat.tone}`}><stat.icon className="h-5 w-5" /></span>
            </div>
            <p className="mt-5 text-4xl font-bold tracking-tight text-[#073f39]">{stat.value}</p>
          </div>
        ))}
      </div> : null}
      {!dbUnavailable ? (
        <section className="overflow-hidden rounded-[1.5rem] border border-[#dbe9df] bg-white shadow-sm shadow-[#073f39]/5">
          <div className="border-b border-[#dbe9df] bg-[#f3faf5] px-5 py-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-leaf">{t("ទិន្នន័យសង្ខេប", "Insights")}</p>
              <h2 className="text-lg font-bold text-ink">{t("ការវិភាគប្រជុំដោយ AI", "AI Meeting Analytics")}</h2>
            </div>
            <Wand2 className="h-5 w-5 text-saffron" />
          </div>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
            <AnalyticsTile label={t("គុណភាពប្រជុំ", "Meeting quality")} value={avgQualityScore !== null ? `${avgQualityScore}%` : "-"} tone="leaf" />
            <AnalyticsTile label={t("ការបញ្ចប់កិច្ចការ", "Task completion")} value={completionRate !== null ? `${completionRate}%` : "-"} tone="sky" />
            <AnalyticsTile label={t("កិច្ចការយឺត", "Late tasks")} value={String(tasks.filter((task) => task.deadline && task.deadline < now && task.status !== "completed").length)} tone="saffron" />
            <AnalyticsTile label={t("រយៈពេលប្រជុំជាមធ្យម", "Average meeting time")} value={avgMeetingMinutes ? `${avgMeetingMinutes} ${t("នាទី", "min")}` : "-"} tone="ink" />
          </div>
          {speakingTime.length ? (
            <div className="px-5 pb-5">
              <p className="mb-2 text-sm font-bold text-ink">{t("អ្នកនិយាយច្រើនជាងគេ (ការថតតាមម៉ាស៊ីនមេ)", "Who talks most (server recordings)")}</p>
              <div className="space-y-2">
                {speakingTime.map((speaker) => {
                  const maxSeconds = speakingTime[0].seconds || 1;
                  return (
                    <div key={speaker.name} className="flex items-center gap-3 rounded-xl border border-leaf/10 bg-white/70 px-3 py-2 shadow-sm">
                      <span className="w-28 shrink-0 truncate text-xs text-slate-600">{speaker.name}</span>
                      <div className="h-2 flex-1 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-leaf" style={{ width: `${Math.max(4, (speaker.seconds / maxSeconds) * 100)}%` }} />
                      </div>
                      <span className="w-14 shrink-0 text-right text-xs text-slate-500">{Math.round(speaker.seconds / 60)} {t("នាទី", "min")}</span>
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
        <section className="overflow-hidden rounded-[1.5rem] border border-[#dbe9df] bg-white shadow-sm shadow-[#073f39]/5">
          <div className="border-b border-[#dbe9df] bg-[#f3faf5] px-5 py-4">
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
        <section className="overflow-hidden rounded-[1.5rem] border border-[#dbe9df] bg-white shadow-sm shadow-[#073f39]/5">
          <div className="border-b border-[#dbe9df] bg-[#f3faf5] px-5 py-4">
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
    leaf: "bg-[#087862]",
    sky: "bg-[#0b7a70]",
    saffron: "bg-[#e5ad33]",
    ink: "bg-[#073f39]"
  }[tone];
  return (
    <div className="rounded-xl border border-[#dbe9df] bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full w-2/3 rounded-full ${toneClass}`} />
      </div>
    </div>
  );
}
