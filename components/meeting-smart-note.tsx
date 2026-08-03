import { AlertTriangle, CircleHelp, Lightbulb, ShieldAlert } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui";
import { regenerateSmartNote, updateDecision } from "@/lib/actions";
import { computeMeetingRisks } from "@/lib/risk-detection";

type Decision = {
  id: string;
  title: string;
  ownerName: string | null;
  deadline: Date | null;
  status: string;
  sourceText: string | null;
};

type Task = { title: string; assigneeName: string | null; deadline: Date | null; status: string };

type SmartNoteData = { problems?: string[]; ideas?: string[]; questions?: string[] } | null;

const decisionStatusLabel: Record<string, string> = {
  pending: "កំពុងរង់ចាំ",
  in_progress: "កំពុងធ្វើ",
  done: "រួចរាល់"
};

export function MeetingSmartNote({
  meetingId,
  smartNote,
  decisions,
  tasks,
  hasTranscript
}: {
  meetingId: string;
  smartNote: SmartNoteData;
  decisions: Decision[];
  tasks: Task[];
  hasTranscript: boolean;
}) {
  const questions = smartNote?.questions ?? [];
  const risks = computeMeetingRisks(tasks, decisions, questions);

  return (
    <section className="kh-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">AI Smart Note</h2>
          <p className="mt-1 text-xs text-slate-500">Decisions, Problems, Ideas, Questions - split by AI instead of one long paragraph.</p>
        </div>
        <form action={regenerateSmartNote}>
          <input type="hidden" name="id" value={meetingId} />
          <ActionButton className="kh-button-secondary" disabled={!hasTranscript}>
            Regenerate
          </ActionButton>
        </form>
      </div>

      {risks.length ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-red-700">
            <ShieldAlert className="h-4 w-4" />
            AI Risk Detection ({risks.length})
          </p>
          <ul className="mt-2 space-y-1 text-xs text-red-700">
            {risks.slice(0, 8).map((risk, index) => (
              <li key={index}>⚠️ {risk.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-5">
        <p className="mb-2 text-sm font-bold text-ink">Decisions</p>
        {decisions.length ? (
          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Decision</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Deadline</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {decisions.map((decision) => (
                  <tr key={decision.id}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-ink">{decision.title}</p>
                      {decision.sourceText ? <p className="mt-0.5 text-xs text-slate-500">{decision.sourceText}</p> : null}
                    </td>
                    <td className="px-3 py-2">
                      <form id={`decision-${decision.id}`} action={updateDecision} className="contents">
                        <input type="hidden" name="id" value={decision.id} />
                        <input className="kh-input min-w-32" name="ownerName" defaultValue={decision.ownerName ?? ""} placeholder="Owner" />
                      </form>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        form={`decision-${decision.id}`}
                        className="kh-input min-w-36"
                        name="deadline"
                        type="date"
                        defaultValue={decision.deadline?.toISOString().slice(0, 10) ?? ""}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select form={`decision-${decision.id}`} className="kh-input min-w-32" name="status" defaultValue={decision.status}>
                        <option value="pending">{decisionStatusLabel.pending}</option>
                        <option value="in_progress">{decisionStatusLabel.in_progress}</option>
                        <option value="done">{decisionStatusLabel.done}</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <ActionButton className="kh-button-primary" form={`decision-${decision.id}`}>
                        Save
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No decisions yet" description="Decisions found in the transcript will appear here." />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SmartNoteList icon={AlertTriangle} title="Problems" items={smartNote?.problems ?? []} tone="text-amber-600" />
        <SmartNoteList icon={Lightbulb} title="Ideas" items={smartNote?.ideas ?? []} tone="text-sky" />
        <SmartNoteList icon={CircleHelp} title="Questions" items={questions} tone="text-purple-600" />
      </div>
    </section>
  );
}

function SmartNoteList({
  icon: Icon,
  title,
  items,
  tone
}: {
  icon: typeof AlertTriangle;
  title: string;
  items: string[];
  tone: string;
}) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className={`flex items-center gap-2 text-sm font-bold ${tone}`}>
        <Icon className="h-4 w-4" />
        {title}
      </p>
      <ul className="mt-2 space-y-1 text-xs text-slate-600">
        {items.map((item, index) => (
          <li key={index}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}
