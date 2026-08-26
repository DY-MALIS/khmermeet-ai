import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePageUser } from "@/lib/session";
import { StudioEditor } from "@/components/studio-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StudioProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser();
  const project = await prisma.workbenchProject.findFirst({
    where: { id, ownerId: user.id },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 30 } }
  });
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/studio" className="flex items-center gap-1 text-sm font-semibold text-leaf hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Scribe Studio
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-ink">{project.title}</h1>
        </div>
      </div>

      <StudioEditor
        project={{
          id: project.id,
          title: project.title,
          rawTranscript: project.rawTranscript,
          cleanTranscript: project.cleanTranscript,
          translatedText: project.translatedText,
          summaryResult: project.summaryResult,
          sourceLanguage: project.sourceLanguage,
          targetLanguage: project.targetLanguage,
          versions: project.versions.map((version) => ({
            id: version.id,
            kind: version.kind,
            content: version.content,
            createdAt: version.createdAt.toISOString()
          }))
        }}
      />
    </div>
  );
}

