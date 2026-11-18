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
  const { language, text } = await getServerUiText();
  const recordings = await prisma.meeting
    .findMany({
      where: { ...ownerWhere(user), audioUrl: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 8
    })
    .catch(() => []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="kh-page-hero flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#f5cb3f]">{text.recordingEyebrow}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{text.newMeeting}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/85">{text.newMeetingDescription}</p>
        </div>
        <a className="relative z-10 inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20" href="/meetings/call">{text.openVideoMeeting}</a>
      </div>
      <NextMeetingPrep user={user} language={language} />
      <RecordingPanel />
      <ExternalMediaUploadPanel />
      <section className="kh-card p-5 sm:p-6">
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
              <article className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 transition hover:border-slate-200 hover:bg-white hover:shadow-sm" key={meeting.id}>
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
