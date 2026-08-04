import { Trash2 } from "lucide-react";
import { QuickRecorder } from "@/components/quick-recorder";
import { deleteRecording, transcribeRecordingAudio } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatMeetingDuration } from "@/lib/time-format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RecordingsPage() {
  const user = await requireUser();
  const recordings = await prisma.recording
    .findMany({
      where: { createdById: user.id },
      orderBy: { createdAt: "desc" }
    })
    .catch(() => []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">ថតសំឡេងរហ័ស</p>
        <h1 className="text-3xl font-bold text-ink">Quick Recorder</h1>
        <p className="mt-2 text-slate-500">ថតសំឡេងអ្វីមួយពីខាងក្រៅ ដោយមិនចាំបាច់ចាប់ផ្តើមការប្រជុំឡើយ រួចរក្សាទុកនៅទីនេះ។</p>
      </div>
      <QuickRecorder />
      <section className="kh-card p-5">
        <div className="mb-4">
          <p className="text-sm font-semibold text-leaf">Saved recordings</p>
          <h2 className="text-xl font-bold text-ink">ការថតដែលបានរក្សាទុក</h2>
        </div>
        {recordings.length ? (
          <div className="space-y-3">
            {recordings.map((recording) => (
              <article className="rounded-xl border border-slate-100 bg-slate-50 p-4" key={recording.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink">{recording.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {recording.createdAt.toLocaleString()} · {formatMeetingDuration(recording.duration)}
                    </p>
                    <audio className="mt-3 w-full" controls src={recording.audioUrl} />
                    {recording.transcript ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-semibold text-leaf">មើលអត្ថបទបំលែង</summary>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{recording.transcript}</p>
                      </details>
                    ) : (
                      <form action={transcribeRecordingAudio} className="mt-3">
                        <input type="hidden" name="id" value={recording.id} />
                        <button className="kh-button-secondary" type="submit">
                          បំលែងជាអត្ថបទ
                        </button>
                      </form>
                    )}
                  </div>
                  <form action={deleteRecording}>
                    <input type="hidden" name="id" value={recording.id} />
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
            <p className="mt-1 text-sm text-slate-500">ចុចចាប់ផ្តើមថតខាងលើ ដើម្បីរក្សាទុកសំឡេងដំបូងរបស់អ្នក។</p>
          </div>
        )}
      </section>
    </div>
  );
}
