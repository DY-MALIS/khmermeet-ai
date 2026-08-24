import { FileText, Volume2 } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { AnalyzeInWorkspaceButton } from "@/components/analyze-in-workspace-button";
import { EmptyState } from "@/components/ui";
import { formatMeetingDuration } from "@/lib/time-format";
import { hasUsableTranscript } from "@/lib/transcript-quality";
import { TranscribeAudioButton } from "@/components/transcribe-audio-button";
import { RecordedAudioPlayer } from "@/components/recorded-audio-player";
import { applyKnownSpeakerLabels } from "@/lib/storage";
import { getServerUiText } from "@/lib/server-ui-text";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TranscriptsPage() {
  const user = await requireUser();
  const { text } = await getServerUiText();
  const data = await prisma.meeting
    .findMany({
      where: ownerWhere(user),
      include: {
        transcriptSegments: {
          where: { audioUrl: { not: null } },
          orderBy: [{ startMs: "asc" }, { segmentIndex: "asc" }, { id: "asc" }]
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 20
    })
    .then((meetings) => ({ meetings, dbUnavailable: false }))
    .catch(() => ({ meetings: [], dbUnavailable: true }));
  const { meetings, dbUnavailable } = data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">Transcript</p>
        <h1 className="text-3xl font-bold text-ink">{text.transcriptTitle}</h1>
        <p className="mt-2 text-sm text-slate-500">{text.transcriptDescription}</p>
      </div>
      {dbUnavailable ? (
        <div className="rounded-lg border border-saffron/30 bg-saffron/10 p-4 text-sm text-ink">
          {text.transcriptDbUnavailable}
        </div>
      ) : null}
      {!dbUnavailable && meetings.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {meetings.map((meeting) => {
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
            const transcript = applyKnownSpeakerLabels(meeting.transcript ?? "", speakerNames);
            const usableTranscript = hasUsableTranscript(transcript);
            const audioItems = meeting.audioUrl
              ? [{ key: "meeting-audio", label: "Recorded audio", audioUrl: meeting.audioUrl }]
              : meeting.transcriptSegments
                  .filter((segment) => segment.audioUrl)
                  .map((segment) => ({
                    key: segment.id,
                    label: segment.speakerName || segment.speakerIdentity || "Participant audio",
                    audioUrl: segment.audioUrl as string
                  }));

            return (
              <article className="kh-card p-5" key={meeting.id}>
                <div className="mb-4 flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf/10 text-leaf">
                    {usableTranscript ? <FileText className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/meetings/${meeting.id}`} className="text-lg font-bold text-ink hover:text-leaf">
                      {meeting.title}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {meeting.updatedAt.toLocaleString()} · {formatMeetingDuration(meeting.duration)}
                    </p>
                  </div>
                </div>
                {audioItems.length ? (
                  <div className="mb-4 space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {text.recordedAudio}
                    </p>
                    {audioItems.map((item) => (
                      <RecordedAudioPlayer
                        key={item.key}
                        label={audioItems.length > 1 ? item.label : undefined}
                        src={item.audioUrl}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mb-4 rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm leading-6 text-ink">
                    <p className="font-semibold">{text.noRecordedAudioForRecord}</p>
                    <p className="mt-1 text-slate-600">
                      {text.noRecordedAudioForRecordDescription}
                    </p>
                  </div>
                )}
                {usableTranscript ? (
                  <div className="space-y-3">
                    <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-7 text-slate-700">{transcript}</p>
                    <AnalyzeInWorkspaceButton transcript={transcript} />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm leading-6 text-slate-600">
                    <p className="font-semibold text-ink">{text.noRealTranscript}</p>
                  <p className="mt-1">
                    {text.noRealTranscriptDescription}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {meeting.audioUrl || meeting.transcriptSegments.some((segment) => segment.audioUrl) ? (
                      <TranscribeAudioButton meetingId={meeting.id} />
                    ) : null}
                    <Link className="kh-button-secondary inline-flex" href={`/meetings/${meeting.id}`}>
                      Open meeting
                    </Link>
                  </div>
                </div>
              )}
              </article>
            );
          })}
        </div>
      ) : !dbUnavailable ? (
        <EmptyState title={text.noTranscriptsYet} description={text.noTranscriptsYetDescription} />
      ) : null}
    </div>
  );
}
