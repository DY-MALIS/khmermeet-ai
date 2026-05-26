import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui";
import { ExportButton } from "@/components/export-button";
import { MeetingSummaryAgent } from "@/components/meeting-summary-agent";
import { extractTasks, generateSummary, updateTranscript } from "@/lib/actions";
import { getMeetingById } from "@/lib/actions";
import { formatMeetingDuration } from "@/lib/time-format";

const summaryHeadings = [
  "សង្ខេបប្រជុំ",
  "ចំណុចសំខាន់ៗ",
  "ការសម្រេចចិត្ត",
  "បញ្ហាដែលបានលើកឡើង",
  "ជំហានបន្ទាប់",
  "Meeting overview",
  "Key discussion points",
  "Decisions made",
  "Problems mentioned",
  "Next steps"
];

function normalizeSummaryHeading(line: string) {
  return line.replace(/^\d+\.\s*/, "").replace(/^#+\s*/, "").replace(/:$/, "").trim();
}

function isSummaryHeading(line: string) {
  const normalized = normalizeSummaryHeading(line);
  return summaryHeadings.some((heading) => heading.toLowerCase() === normalized.toLowerCase());
}

function SummaryDisplay({ summary }: { summary: string }) {
  const sections: Array<{ title: string; items: string[] }> = [];
  let current: { title: string; items: string[] } | null = null;

  summary.split(/\n+/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    if (isSummaryHeading(line)) {
      current = { title: normalizeSummaryHeading(line), items: [] };
      sections.push(current);
      return;
    }

    if (!current) {
      current = { title: "សង្ខេបប្រជុំ", items: [] };
      sections.push(current);
    }
    current.items.push(line.replace(/^[-•]\s*/, ""));
  });

  if (!sections.length) {
    return <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{summary}</div>;
  }

  return (
    <div className="space-y-3">
      {sections.map((section, index) => (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4" key={`${section.title}-${index}`}>
          <h3 className="mb-2 font-bold text-ink">{section.title}</h3>
          {section.items.length ? (
            <ul className="space-y-2 text-sm leading-7 text-slate-700">
              {section.items.map((item, itemIndex) => (
                <li className="flex gap-2" key={`${item}-${itemIndex}`}>
                  <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">មិនមានព័ត៌មានច្បាស់លាស់</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await getMeetingById(id);
  if (!meeting) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-leaf">ព័ត៌មានប្រជុំ</p>
          <h1 className="text-3xl font-bold text-ink">{meeting.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{meeting.createdAt.toLocaleString()} · {formatMeetingDuration(meeting.duration)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton title={meeting.title} transcript={meeting.transcript} summary={meeting.summary} />
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
          <form action={updateTranscript} className="space-y-3">
            <input type="hidden" name="id" value={meeting.id} />
            <textarea className="kh-input min-h-72" name="transcript" defaultValue={meeting.transcript ?? ""} placeholder="បិទភ្ជាប់ transcript នៅទីនេះ..." />
            <ActionButton>រក្សាទុក transcript</ActionButton>
          </form>
        </section>
        <section className="kh-card p-5">
          <h2 className="mb-4 text-lg font-bold">AI Summary</h2>
          {meeting.summary ? (
            <SummaryDisplay summary={meeting.summary} />
          ) : (
            <EmptyState title="មិនទាន់មាន summary" description="បញ្ចូល transcript រួចប្រើ Summary Agent ឬចុច Generate AI Summary។" />
          )}
          <MeetingSummaryAgent meetingId={meeting.id} hasTranscript={Boolean(meeting.transcript?.trim())} />
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
