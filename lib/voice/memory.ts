import { prisma } from "@/lib/prisma";
import { decodeToPcm16k } from "@/lib/ffmpeg";
import { isPlaceholderParticipantName, loadStoredAudioBytes } from "@/lib/storage";
import { combineVoiceprints, cosine, matchVoice, MIN_SPEECH_SECONDS, speechOnly, speechSeconds, voiceprint } from "./voiceprint";

// Voice memory: each account remembers the people heard in its meetings,
// so a returning voice can be named in a later meeting without them saying
// their name again. Only voiceprints (numbers) are stored, never audio.

// How much of a recording to decode while looking for a minute of speech.
const DECODE_SECONDS = 15 * 60;
// A new sample under a name it does not sound like is not merged in: it is
// more likely someone else on that device, echo, or two people sharing a
// name than the same person - and one bad sample would blur the voice used
// to recognise them from then on.
const SAME_PERSON_FLOOR = 0.45;

export type LearnResult =
  | { learned: true; name: string; seconds: number }
  | { learned: false; reason: "not-enough-speech" | "does-not-match-name" | "sounds-like-someone-else"; detail?: string };

function personKey(name: string) {
  return name.trim().toLocaleLowerCase();
}

// Everyone this account remembers, one combined voiceprint each.
export async function rememberedVoices(ownerId: string) {
  const samples = await prisma.voiceSample.findMany({
    where: { ownerId },
    select: { name: true, voiceprint: true, seconds: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });
  const people = new Map<string, { name: string; samples: typeof samples }>();
  for (const sample of samples) {
    const key = personKey(sample.name);
    const person = people.get(key) ?? { name: sample.name, samples: [] };
    person.name = sample.name; // latest spelling wins
    person.samples.push(sample);
    people.set(key, person);
  }
  return [...people.values()].map((person) => ({
    name: person.name,
    voiceprint: combineVoiceprints(person.samples),
    seconds: person.samples.reduce((total, sample) => total + sample.seconds, 0),
    samples: person.samples.length
  }));
}

// Learns (or refreshes) one person's voice from a recording of them alone,
// e.g. a call participant's own microphone track.
export async function learnVoiceFromRecording(input: {
  ownerId: string;
  name: string;
  audioUrl: string;
  meetingId: string | null;
  source: "call" | "intro" | "named";
  sourceKey: string;
}): Promise<LearnResult> {
  const name = input.name.trim();
  const { bytes } = await loadStoredAudioBytes(input.audioUrl);
  const speech = speechOnly(await decodeToPcm16k(bytes, DECODE_SECONDS));
  const seconds = speechSeconds(speech);
  if (seconds < MIN_SPEECH_SECONDS) return { learned: false, reason: "not-enough-speech", detail: `${seconds.toFixed(1)}s` };

  const voice = await voiceprint(speech);
  const others = await rememberedVoices(input.ownerId);
  const same = others.find((person) => personKey(person.name) === personKey(name));
  if (same && cosine(voice, same.voiceprint) < SAME_PERSON_FLOOR) {
    return { learned: false, reason: "does-not-match-name", detail: cosine(voice, same.voiceprint).toFixed(2) };
  }
  const closest = matchVoice(voice, others.filter((person) => personKey(person.name) !== personKey(name)));
  if (closest) return { learned: false, reason: "sounds-like-someone-else", detail: `${closest.name} ${closest.score.toFixed(2)}` };

  await prisma.voiceSample.upsert({
    where: { ownerId_sourceKey: { ownerId: input.ownerId, sourceKey: input.sourceKey } },
    create: {
      ownerId: input.ownerId,
      name,
      meetingId: input.meetingId,
      source: input.source,
      sourceKey: input.sourceKey,
      voiceprint: Array.from(voice),
      seconds
    },
    update: { name, voiceprint: Array.from(voice), seconds }
  });
  return { learned: true, name, seconds };
}

// The remembered person this speech belongs to, if anyone is a clear match.
export async function recogniseVoice(ownerId: string, speech: Float32Array) {
  if (speechSeconds(speech) < MIN_SPEECH_SECONDS) return null;
  const people = await rememberedVoices(ownerId);
  if (!people.length) return null;
  return matchVoice(await voiceprint(speech), people);
}

// After a call, each participant's own microphone track is a clean sample of
// one known person (the name they joined with). Learned in the background;
// a failure here never affects the call's transcript.
export async function learnCallParticipantVoice(segmentId: string) {
  const segment = await prisma.meetingTranscriptSegment.findUnique({
    where: { id: segmentId },
    select: { id: true, meetingId: true, speakerName: true, audioUrl: true, meeting: { select: { createdById: true } } }
  });
  const name = segment?.speakerName?.trim();
  if (!segment?.audioUrl || !name || isPlaceholderParticipantName(name)) return null;
  return learnVoiceFromRecording({
    ownerId: segment.meeting.createdById,
    name,
    audioUrl: segment.audioUrl,
    meetingId: segment.meetingId,
    source: "call",
    sourceKey: `segment:${segment.id}`
  });
}
