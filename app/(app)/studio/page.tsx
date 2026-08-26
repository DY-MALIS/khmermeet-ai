import { Sparkles, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePageUser } from "@/lib/session";
import { createStudioProject, deleteStudioProject } from "@/lib/studio-actions";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StudioPage() {
  const user = await requirePageUser();
  const data = await prisma.workbenchProject
    .findMany({
      where: { ownerId: user.id, archived: false },
      orderBy: { updatedAt: "desc" },
      take: 100
    })
    .then((projects) => ({ projects, dbUnavailable: false }))
    .catch(() => ({ projects: [], dbUnavailable: true }));
  const { projects, dbUnavailable } = data;

  return (
    <div className="space-y-6">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-leaf">
          <Sparkles className="h-4 w-4" />
          Scribe Studio
        </p>
        <h1 className="text-3xl font-bold text-ink">កែសម្រួល Transcript</h1>
        <p className="mt-2 text-sm text-slate-500">
          បិទភ្ជាប់ transcript ណាមួយ (មិនចាំបាច់ជាប្រជុំ) ដើម្បី clean, translate, និង summarize ដោយ AI, ព្រមទាំងរក្សា version history។
        </p>
      </div>

      {dbUnavailable ? (
        <div className="rounded-lg border border-saffron/30 bg-saffron/10 p-4 text-sm text-ink">
          មិនអាចភ្ជាប់ production database បានទេ។ សូមពិនិត្យ DATABASE_URL និង Supabase រួចសាកម្តងទៀត។
        </div>
      ) : null}

      <form action={createStudioProject} className="kh-card grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
        <input className="kh-input" name="title" placeholder="ចំណងជើងគម្រោង ឧ. ការសម្ភាសន៍អតិថិជន" required />
        <ActionButton>បង្កើតគម្រោងថ្មី</ActionButton>
      </form>

      {!dbUnavailable && projects.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <article className="kh-card p-5" key={project.id}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <a href={`/studio/${project.id}`} className="text-lg font-bold text-ink hover:text-leaf">
                  {project.title}
                </a>
                <form action={deleteStudioProject}>
                  <input type="hidden" name="id" value={project.id} />
                  <ActionButton className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </ActionButton>
                </form>
              </div>
              <p className="text-sm text-slate-500">{project.updatedAt.toLocaleString()}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="kh-badge bg-leaf/10 text-leaf">{project.status}</span>
                {project.cleanTranscript ? <span className="kh-badge bg-sky/10 text-sky">clean</span> : null}
                {project.translatedText ? <span className="kh-badge bg-saffron/10 text-saffron">translated</span> : null}
                {project.summaryResult ? <span className="kh-badge bg-slate-100 text-slate-600">summary</span> : null}
              </div>
            </article>
          ))}
        </div>
      ) : !dbUnavailable ? (
        <EmptyState title="មិនទាន់មានគម្រោង" description="បង្កើតគម្រោងថ្មីខាងលើ ដើម្បីចាប់ផ្តើមកែសម្រួល transcript ដោយ AI។" />
      ) : null}
    </div>
  );
}

