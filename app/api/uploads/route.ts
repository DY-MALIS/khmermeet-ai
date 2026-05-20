import { NextResponse } from "next/server";
import { saveLocalAudio, transcribeAudio } from "@/lib/storage";
import { requireUser } from "@/lib/session";

export const maxDuration = 60;
const transcriptionTimeoutMs = Number(process.env.OPENAI_TRANSCRIBE_TIMEOUT_MS ?? 45000);

export async function POST(request: Request) {
  await requireUser();
  const formData = await request.formData();
  const file = formData.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
  }
  const speakersField = formData.get("speakers");
  const speakerNames =
    typeof speakersField === "string"
      ? parseSpeakerNames(speakersField)
      : [];
  const audioUrl = await saveLocalAudio(file);
  try {
    const speakerAudioFiles = formData.getAll("speakerAudio").filter((item): item is File => item instanceof File && item.size > 0);
    const speakerAudioNamesField = formData.get("speakerAudioNames");
    const speakerAudioNames = typeof speakerAudioNamesField === "string" ? parseSpeakerNames(speakerAudioNamesField) : [];
    const speakerTranscript = await withTimeout(transcribeSpeakerAudio(speakerAudioFiles, speakerAudioNames), transcriptionTimeoutMs);
    const transcript = speakerTranscript || (await withTimeout(transcribeAudio(file, speakerNames), transcriptionTimeoutMs));
    return NextResponse.json({ audioUrl, transcript });
  } catch (error) {
    return NextResponse.json({
      audioUrl,
      transcript: "",
      transcriptionError: error instanceof Error ? error.message : "Could not transcribe audio."
    });
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Transcription timed out, but the audio was uploaded.")), timeoutMs)
    )
  ]);
}

async function transcribeSpeakerAudio(files: File[], names: string[]) {
  if (!files.length) return "";
  const parts = await Promise.all(
    files.map(async (file, index) => {
      const speakerName = names[index] || `Speaker ${index + 1}`;
      const text = await transcribeAudio(file, [speakerName]);
      return ensureSpeakerLabel(text, speakerName);
    })
  );

  return parts.filter(Boolean).join("\n\n").trim();
}

function ensureSpeakerLabel(text: string, speakerName: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/^[^:\n]{1,60}:\s/.test(line) ? line : `${speakerName}: ${line}`))
    .join("\n");
}

function parseSpeakerNames(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((speaker): speaker is string => typeof speaker === "string")
      .map((speaker) => speaker.trim())
      .filter(Boolean)
      .slice(0, 20);
  } catch {
    return [];
  }
}
