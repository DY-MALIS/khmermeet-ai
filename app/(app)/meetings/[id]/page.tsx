import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { EmptyState, ErrorState } from "@/components/ui";
import { ExportButton } from "@/components/export-button";
import { MeetingTranscriptPanel } from "@/components/meeting-transcript-panel";
import { MeetingSummaryAgent } from "@/components/meeting-summary-agent";
import { SummaryDisplay } from "@/components/summary-display";
import { MeetingAskChat } from "@/components/meeting-ask-chat";
import { extractTasks, generateSummary, getMeetingById } from "@/lib/actions";
import { formatMeetingDuration } from "@/lib/time-format";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { applyKnownSpeakerLabels, normalizeTranscriptionLanguageMode } from "@/lib/storage";
import { AUDIO_PLAYER_ELEMENT_ID } from "@/lib/audio-player";
import { RecordedAudioPlayer } from "@/components/recorded-audio-player";
import { getServerUiText } from "@/lib/server-ui-text";
import type { UiTextKey } from "@/lib/ui-translations";

function meetingLoadErrorMessage(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error && typeof error.code === "string"
      ? error.code
      : "";

  if (code === "P2022") {
    return "Database schema is missing a column used by meetings. Run the latest Prisma migration or paste prisma/supabase-setup.sql in Supabase SQL Editor.";
  }

  if (code === "P2021") {
    return "Database tables are missing. Run the Prisma migration or paste prisma/supabase-setup.sql in Supabase SQL Editor.";
  }

  if (code === "P1001") {
    return "Database server cannot be reached. Check DATABASE_URL and Supabase project status, then try again.";
  }

  return "Database is not available right now, so this meeting detail cannot load. Please check DATABASE_URL/Supabase status, then try again.";
}

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text } = await getServerUiText();
  const meetingResult = await getMeetingById(id)
    .then((meeting) => ({ meeting, error: "" }))
    .catch((error) => ({
      meeting: null,
      error: meetingLoadErrorMessage(error)
    }));
  const { meeting, error } = meetingResult;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <p className="text-sm font-semibold text-leaf">{text.meetingDetail}</p>
          <h1 className="text-3xl font-bold text-ink">{text.cannotOpenMeeting}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {text.meetingLoadFailed}
          </p>
        </div>
        <ErrorState message={error} />
        <div className="flex flex-wrap gap-2">
          <Link className="kh-button-primary" href="/meetings">
            {text.backToHistory}
          </Link>
          <Link className="kh-button-secondary" href="/dashboard">
            {text.backToDashboard}
          </Link>
        </div>
      </div>
    );
  }

  if (!meeting) notFound();

  const speakerNames = Array.from(
    new Set(
      [
        ...(meeting.speakerNames ?? []),
        ...meeting.transcriptSegments.map((segment) => segment.speakerName || segment.speakerIdentity)
      ]
        .map((name) => name.trim())
        .filter(Boolean)
    )
  ).slice(0, 100);
  const labeledTranscript = applyKnownSpeakerLabels(meeting.transcript ?? "", speakerNames);
  const transcriptIsUsable = hasUsableTranscript(labeledTranscript);
  const transcriptText = transcriptIsUsable ? labeledTranscript : "";
  const summaryText = transcriptIsUsable ? meeting.summary : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-leaf">{text.meetingDetail}</p>
          <h1 className="text-3xl font-bold text-ink">{meeting.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {meeting.createdAt.toLocaleString()} - {formatMeetingDuration(meeting.duration)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={generateSummary}>
            <input type="hidden" name="id" value={meeting.id} />
            <ActionButton>{text.regenerateSummary}</ActionButton>
          </form>
          <form action={extractTasks}>
            <input type="hidden" name="id" value={meeting.id} />
            <ActionButton className="kh-button-secondary">{text.extractTasksAgain}</ActionButton>
          </form>
        </div>
      </div>

      {meeting.audioUrl ? (
        <div className="kh-card p-4">
          <RecordedAudioPlayer audioId={AUDIO_PLAYER_ELEMENT_ID} src={meeting.audioUrl} />
        </div>
      ) : meeting.transcriptSegments.length ? (
        // Server Rec meetings: each participant recorded their own full
        // call as one continuous file (no single mixed track to show one
        // player for) - one player per person instead.
        <div className="kh-card space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {text.recordedAudioBySpeaker}
          </p>
          {meeting.transcriptSegments.map((segment) => (
            <RecordedAudioPlayer
              key={segment.id}
              label={segment.speakerName || segment.speakerIdentity}
              src={segment.audioUrl ?? ""}
            />
          ))}
        </div>
      ) : (
        <div className="kh-card border-saffron/30 bg-saffron/10 p-4 text-sm leading-6 text-ink">
          <p className="font-semibold">{text.noRecordedAudio}</p>
          <p className="mt-1 text-slate-600">
            {text.noRecordedAudioDescription}
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <MeetingTranscriptPanel
          meetingId={meeting.id}
          audioUrl={meeting.audioUrl}
          initialTranscript={transcriptText}
          rawTranscript={labeledTranscript}
          transcriptIsUsable={transcriptIsUsable}
          speakerNames={speakerNames}
        />

        <section className="kh-card p-5">
          <h2 className="mb-4 text-lg font-bold">{text.aiSummaryTitle}</h2>
          {summaryText ? (
            <SummaryDisplay summary={summaryText} />
          ) : (
            <EmptyState
              title={text.noSummaryYet}
              description={text.noSummaryYet}
            />
          )}
          <MeetingSummaryAgent meetingId={meeting.id} hasTranscript={transcriptIsUsable} />
        </section>
      </div>

      <section className="kh-card p-5">
        <h2 className="mb-4 text-lg font-bold">{text.exportFile}</h2>
        <ExportButton
          title={meeting.title}
          transcript={transcriptText}
          summary={summaryText}
          tasks={meeting.tasks}
          language={normalizeTranscriptionLanguageMode(meeting.language)}
        />
      </section>

      {meeting.tasks.length ? (
        <section className="kh-card overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-bold">{text.transcriptTools}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {text.transcriptToolsDescription}
            </p>
          </div>
          <div className="space-y-5 p-5">
            <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="font-bold text-ink">{text.actionTasks}</h3>
              </div>
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{text.task}</th>
                    <th className="px-4 py-3">{text.assignee}</th>
                    <th className="px-4 py-3">{text.deadline}</th>
                    <th className="px-4 py-3">{text.priority}</th>
                    <th className="px-4 py-3">{text.status}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {meeting.tasks.map((task) => (
                    <tr key={task.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{task.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{task.sourceText}</p>
                      </td>
                      <td className="px-4 py-3">{task.assigneeName ?? "-"}</td>
                      <td className="px-4 py-3">{task.deadline?.toLocaleDateString() ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span className="kh-badge bg-sky/10 text-sky">{task.priority}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`kh-badge ${taskStatusBadgeTone(task)}`}>{taskStatusLabel(task, text)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      <MeetingAskChat meetingId={meeting.id} hasTranscript={transcriptIsUsable} hasAudio={Boolean(meeting.audioUrl)} />
    </div>
  );
}

function taskStatusLabel(task: { status: string; deadline: Date | null }, text: Record<UiTextKey, string>) {
  if (task.status !== "completed" && task.deadline && task.deadline < new Date()) return text.overdue;
  if (task.status === "completed") return text.done;
  if (task.status === "in_progress") return text.inProgress;
  return text.notStarted;
}

function taskStatusBadgeTone(task: { status: string; deadline: Date | null }) {
  if (task.status !== "completed" && task.deadline && task.deadline < new Date()) return "bg-red-100 text-red-700";
  if (task.status === "completed") return "bg-emerald-100 text-emerald-700";
  if (task.status === "in_progress") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}
