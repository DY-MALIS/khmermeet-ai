/* eslint-disable @next/next/no-html-link-for-pages */
import { Trash2 } from "lucide-react";
import { ExternalMediaUploadPanel } from "@/components/external-media-upload-panel";
import { RecordingPanel } from "@/components/recording-panel";
import { NextMeetingPrep } from "@/components/next-meeting-prep";
import { deleteMeeting } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { formatMeetingDuration } from "@/lib/time-format";
import { RecordedAudioPlayer } from "@/components/recorded-audio-player";
import { getServerUiText } from "@/lib/server-ui-text";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewMeetingPage() {
  const user = await requireUser();
  const { text } = await getServerUiText();
  const recordings = await prisma.meeting
    .findMany({
      where: { ...ownerWhere(user), audioUrl: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 8
    })
    .catch(() => []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">{text.recordingEyebrow}</p>
        <h1 className="text-3xl font-bold text-ink">{text.newMeeting}</h1>
        <p className="mt-2 text-slate-500">{text.newMeetingDescription}</p>
        <a className="kh-button-secondary mt-4" href="/meetings/call">{text.openVideoMeeting}</a>
      </div>
      <NextMeetingPrep user={user} />
      <RecordingPanel />
      <ExternalMediaUploadPanel />
      <section className="kh-card p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-leaf">{text.savedRecordings}</p>
            <h2 className="text-xl font-bold text-ink">{text.savedRecordingsTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{text.savedRecordingsDescription}</p>
          </div>
          <a className="kh-button-secondary" href="/meetings">{text.viewAllHistory}</a>
        </div>
        {recordings.length ? (
          <div className="space-y-3">
            {recordings.map((meeting) => (
              <article className="rounded-xl border border-slate-100 bg-slate-50 p-4" key={meeting.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <a className="font-bold text-ink hover:text-leaf" href={`/meetings/${meeting.id}`}>
                      {meeting.title}
                    </a>
                    <p className="mt-1 text-xs text-slate-500">
                      {meeting.createdAt.toLocaleString()} · {formatMeetingDuration(meeting.duration)}
                    </p>
                    {meeting.audioUrl ? (
                      <div className="mt-3">
                        <RecordedAudioPlayer src={meeting.audioUrl} />
                      </div>
                    ) : null}
                  </div>
                  <form action={deleteMeeting}>
                    <input type="hidden" name="id" value={meeting.id} />
                    <button className="kh-button-secondary border-red-100 text-red-600 hover:bg-red-50" type="submit">
                      <Trash2 className="h-4 w-4" />
                      {text.delete}
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <p className="font-semibold text-ink">{text.noSavedRecordings}</p>
            <p className="mt-1 text-sm text-slate-500">{text.noSavedRecordingsDescription}</p>
          </div>
        )}
      </section>
    </div>
  );
}
