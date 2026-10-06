import { AudioLines, ShieldCheck } from "lucide-react";
import { VoiceMemoryList } from "@/components/voice-memory-list";
import { prisma } from "@/lib/prisma";
import { getServerUiText } from "@/lib/server-ui-text";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function VoicesPage() {
  const user = await requireUser();
  const { text } = await getServerUiText();
  const samples = await prisma.voiceSample.findMany({
    where: { ownerId: user.id },
    select: { name: true, meetingId: true, seconds: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });
  // One row per person: every sample under the same name (any case).
  const people = new Map<string, { name: string; meetings: Set<string>; seconds: number; lastLearned: Date }>();
  for (const sample of samples) {
    const key = sample.name.trim().toLocaleLowerCase();
    const person = people.get(key) ?? { name: sample.name, meetings: new Set<string>(), seconds: 0, lastLearned: sample.createdAt };
    person.name = sample.name;
    if (sample.meetingId) person.meetings.add(sample.meetingId);
    person.seconds += sample.seconds;
    person.lastLearned = sample.createdAt;
    people.set(key, person);
  }
  const list = [...people.values()]
    .sort((a, b) => b.lastLearned.getTime() - a.lastLearned.getTime())
    .map((person) => ({ name: person.name, meetings: Math.max(1, person.meetings.size), seconds: Math.round(person.seconds) }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-leaf">
          <AudioLines className="h-4 w-4" />
          KhmerMeet AI
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-normal text-ink">{text.voicesTitle}</h1>
        <p className="mt-2 max-w-3xl text-slate-600">{text.voicesIntro}</p>
      </div>
      <section className="kh-card flex gap-3 p-4 text-sm text-slate-600">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-leaf" />
        <p>{text.voicesPrivacy}</p>
      </section>
      <VoiceMemoryList people={list} />
    </div>
  );
}
