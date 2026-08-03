/* eslint-disable @next/next/no-html-link-for-pages */
import { Trash2 } from "lucide-react";
import { ExternalMediaUploadPanel } from "@/components/external-media-upload-panel";
import { RecordingPanel } from "@/components/recording-panel";
import { NextMeetingPrep } from "@/components/next-meeting-prep";
import { deleteMeeting } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatMeetingDuration } from "@/lib/time-format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewMeetingPage() {
  const user = await requireUser();
  const recordings = await prisma.meeting
    .findMany({
      where: { createdById: user.id, audioUrl: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 8
    })
    .catch(() => []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">ថតសំឡេងប្រជុំ</p>
        <h1 className="text-3xl font-bold text-ink">ប្រជុំថ្មី</h1>
        <p className="mt-2 text-slate-500">ថតសំឡេងក្នុង browser, ស្តាប់ preview, រួចរក្សាទុក meeting ទៅ local database។</p>
        <a className="kh-button-secondary mt-4" href="/meetings/call">បើកប្រជុំវីដេអូ</a>
      </div>
      <NextMeetingPrep userId={user.id} />
      <RecordingPanel />
      <ExternalMediaUploadPanel />
      <section className="kh-card p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-leaf">Saved recordings</p>
            <h2 className="text-xl font-bold text-ink">ការថតដែលបានរក្សាទុក</h2>
            <p className="mt-1 text-sm text-slate-500">ថតម្តងរក្សាទុកម្តង ហើយអាចលុប record ចាស់ៗពីទីនេះ។</p>
          </div>
          <a className="kh-button-secondary" href="/meetings">មើលប្រវត្តិទាំងអស់</a>
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
                    {meeting.audioUrl ? <audio className="mt-3 w-full" controls src={meeting.audioUrl} /> : null}
                  </div>
                  <form action={deleteMeeting}>
                    <input type="hidden" name="id" value={meeting.id} />
                    <button className="kh-button-secondary border-red-100 text-red-600 hover:bg-red-50" type="submit">
                      <Trash2 className="h-4 w-4" />
                      លុប
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <p className="font-semibold text-ink">មិនទាន់មានការថតដែលបានរក្សាទុក</p>
            <p className="mt-1 text-sm text-slate-500">ចុចចាប់ផ្តើមថត បញ្ចូលចំណងជើង រួចចុចរក្សាទុកប្រជុំ។</p>
          </div>
        )}
      </section>
    </div>
  );
}
