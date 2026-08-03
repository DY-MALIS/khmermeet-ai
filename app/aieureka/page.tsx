import Link from "next/link";
import { BookOpen, GraduationCap } from "lucide-react";
import { aieurekaModules } from "@/lib/aieureka-modules";
import { requireUser } from "@/lib/session";

export default async function AieurekaPage() {
  await requireUser();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">AiEureka</p>
        <h1 className="text-3xl font-bold text-ink">AI Skill for Productivity</h1>
        <p className="mt-2 text-slate-500">វគ្គបណ្តុះបណ្តាលខ្លីៗអំពីការប្រើ AI ដើម្បីបង្កើនផលិតភាពការងារ។</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {aieurekaModules.map((module) => (
          <Link key={module.id} href={`/aieureka/${module.id}`} className="kh-card block p-5 transition hover:border-leaf/40">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-leaf/10 text-leaf">
              <GraduationCap className="h-5 w-5" />
            </span>
            <h2 className="mt-3 text-lg font-bold text-ink">{module.title}</h2>
            <p className="text-sm text-slate-500">{module.titleKh}</p>
            <p className="mt-3 flex items-center gap-1 text-xs text-slate-400">
              <BookOpen className="h-3.5 w-3.5" />
              {module.lessons.length} lessons
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
