import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui";
import { ExportButton } from "@/components/export-button";
import { MeetingSummaryAgent } from "@/components/meeting-summary-agent";
import { SummaryDisplay } from "@/components/summary-display";
import { TranscribeAudioButton } from "@/components/transcribe-audio-button";
import { extractTasks, generateSummary, updateTranscript } from "@/lib/actions";
import { getMeetingById } from "@/lib/actions";
import { formatMeetingDuration } from "@/lib/time-format";
import { hasUsableTranscript } from "@/lib/transcript-quality";

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await getMeetingById(id);
  if (!meeting) notFound();
  const transcriptIsUsable = hasUsableTranscript(meeting.transcript ?? "");
  const transcriptText = transcriptIsUsable ? meeting.transcript ?? "" : "";
  const summaryText = transcriptIsUsable ? meeting.summary : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-leaf">ព័ត៌មានប្រជុំ</p>
          <h1 className="text-3xl font-bold text-ink">{meeting.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{meeting.createdAt.toLocaleString()} · {formatMeetingDuration(meeting.duration)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton title={meeting.title} transcript={transcriptText} summary={summaryText} />
          <form action={generateSummary}><input type="hidden" name="id" value={meeting.id} /><ActionButton>Regenerate summary</ActionButton></form>
          <form action={extractTasks}><input type="hidden" name="id" value={meeting.id} /><ActionButton className="kh-button-secondary">Extract tasks again</ActionButton></form>
        </div>
      </div>
      {meeting.audioUrl ? (
        <div className="kh-card p-4">
          <audio className="w-full" controls src={meeting.audioUrl} />
        </div>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="kh-card p-5">
          <h2 className="mb-4 text-lg font-bold">Transcript</h2>
          {!transcriptIsUsable && meeting.transcript ? (
            <div className="mb-4 rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm leading-6 text-ink">
              Transcript ចាស់មានតែលេខ timestamp ឬគ្មានពាក្យនិយាយច្បាស់ ដូច្នេះ app មិនបង្ហាញវាជា transcript ពិតទៀតទេ។ សូម paste អត្ថបទប្រជុំពិតនៅខាងក្រោម រួចរក្សាទុក។
            </div>
          ) : null}
          {!transcriptIsUsable && meeting.audioUrl ? (
            <div className="mb-4">
              <TranscribeAudioButton meetingId={meeting.id} />
            </div>
          ) : null}
          <form action={updateTranscript} className="space-y-3">
            <input type="hidden" name="id" value={meeting.id} />
            <textarea className="kh-input min-h-72" name="transcript" defaultValue={transcriptText} placeholder="បិទភ្ជាប់ transcript នៅទីនេះ..." />
            <ActionButton>រក្សាទុក transcript</ActionButton>
          </form>
        </section>
        <section className="kh-card p-5">
          <h2 className="mb-4 text-lg font-bold">AI Summary</h2>
          {summaryText ? (
            <SummaryDisplay summary={summaryText} />
          ) : (
            <EmptyState title="មិនទាន់មាន summary" description="បញ្ចូល transcript រួចប្រើ Summary Agent ឬចុច Generate AI Summary។" />
          )}
          <MeetingSummaryAgent meetingId={meeting.id} hasTranscript={transcriptIsUsable} />
        </section>
      </div>
      <section className="kh-card overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-bold">Extracted tasks</h2>
        </div>
        {meeting.tasks.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Deadline</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
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
                    <td className="px-4 py-3"><span className="kh-badge bg-sky/10 text-sky">{task.priority}</span></td>
                    <td className="px-4 py-3"><span className="kh-badge bg-slate-100 text-slate-700">{task.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="p-5"><EmptyState title="មិនទាន់មានកិច្ចការ" description="ចុច Extract Action Tasks ដើម្បីបង្កើតកិច្ចការពី transcript។" /></div>}
      </section>
    </div>
  );
}
