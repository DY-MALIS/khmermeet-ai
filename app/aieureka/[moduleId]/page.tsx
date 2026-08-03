import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FlaskConical } from "lucide-react";
import { AieurekaQuiz } from "@/components/aieureka-quiz";
import { getAieurekaModule } from "@/lib/aieureka-modules";
import { requireUser } from "@/lib/session";

export default async function AieurekaModulePage({ params }: { params: Promise<{ moduleId: string }> }) {
  await requireUser();
  const { moduleId } = await params;
  const module_ = getAieurekaModule(moduleId);
  if (!module_) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm font-semibold text-leaf hover:underline" href="/aieureka">
          ← AiEureka
        </Link>
        <h1 className="mt-1 text-3xl font-bold text-ink">{module_.title}</h1>
        <p className="text-slate-500">{module_.titleKh}</p>
      </div>

      <div className="space-y-6">
        {module_.lessons.map((lesson) => (
          <section key={lesson.id} className="kh-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase text-leaf">{lesson.type}</p>
                <h2 className="text-lg font-bold text-ink">{lesson.title}</h2>
                <p className="text-sm text-slate-500">{lesson.titleKh}</p>
              </div>
            </div>

            {lesson.type === "PDF" ? (
              <div className="flex flex-wrap gap-2">
                <a className="kh-button-primary" href={lesson.content} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                  Open PDF (English)
                </a>
                <a className="kh-button-secondary" href={lesson.contentKh} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                  បើក PDF ខ្មែរ
                </a>
              </div>
            ) : null}

            {lesson.type === "LAB" ? (
              <div className="rounded-lg border border-saffron/30 bg-saffron/5 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
                  <FlaskConical className="h-4 w-4 text-saffron" />
                  Lab scenario
                </p>
                <p className="text-sm leading-6 text-slate-700">{lesson.content}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{lesson.contentKh}</p>
                <p className="mt-3 text-xs text-slate-400">
                  Self-assess against the module&apos;s pass score ({module_.completionRules.labPassScore}/10) - this is a
                  written exercise, not auto-graded.
                </p>
              </div>
            ) : null}

            {lesson.type === "QUIZ" && lesson.quiz ? (
              <AieurekaQuiz questions={lesson.quiz} passPercentage={module_.completionRules.quizPassPercentage} />
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
