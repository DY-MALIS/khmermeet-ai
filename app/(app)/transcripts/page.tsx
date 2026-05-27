import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TranscriptsPage() {
  const user = await requireUser();
  const data = await prisma.meeting
    .findMany({
      where: { createdById: user.id, transcript: { not: null } },
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
        <h1 className="text-3xl font-bold text-ink">អត្ថបទប្រជុំ</h1>
        <p className="mt-2 text-sm text-slate-500">មើលអក្សរដែលបានបម្លែងពីសំឡេង ឬបានបញ្ចូលដោយ Meeting Agent។</p>
      </div>
      {dbUnavailable ? (
        <div className="rounded-lg border border-saffron/30 bg-saffron/10 p-4 text-sm text-ink">
          Database មិនទាន់ដំណើរការ។ ទំព័រនេះត្រូវការ PostgreSQL/Supabase/Neon DATABASE_URL ដើម្បីទាញ transcript ពី meetings។
        </div>
      ) : null}
      {meetings.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {meetings.map((meeting) => (
            <article className="kh-card p-5" key={meeting.id}>
              <div className="mb-4 flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf/10 text-leaf">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <a href={`/meetings/${meeting.id}`} className="text-lg font-bold text-ink hover:text-leaf">
                    {meeting.title}
                  </a>
                  <p className="text-sm text-slate-500">{meeting.updatedAt.toLocaleString()}</p>
                </div>
              </div>
              <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-7 text-slate-700">{meeting.transcript}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="មិនទាន់មានអត្ថបទប្រជុំ" description="ថតប្រជុំ ឬប្រើ Meeting Agent ដើម្បីបង្កើត transcript។" />
      )}
    </div>
  );
}
