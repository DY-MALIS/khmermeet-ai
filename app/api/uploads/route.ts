import { NextResponse } from "next/server";
import { publicAiTranscriptionError } from "@/lib/api-error-messages";
import { normalizeTranscriptionLanguageMode, saveLocalAudio, transcribeAudio, transcribeAudioChunks, type TranscriptionLanguageMode } from "@/lib/storage";
import { requireUser } from "@/lib/session";

export const maxDuration = 300;

export async function POST(request: Request) {
  await requireUser();
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file. Please try again." }, { status: 400 });
  }
  const file = formData.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
  }
  const speakersField = formData.get("speakers");
  const speakerNames =
    typeof speakersField === "string"
      ? parseSpeakerNames(speakersField)
      : [];
  const languageMode = normalizeTranscriptionLanguageMode(formData.get("languageMode"));
  const skipTranscription = formData.get("skipTranscription") === "true";
  let audioUrl: string;
  try {
    audioUrl = await saveLocalAudio(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the recording.";
    return NextResponse.json({ error: message }, { status: 413 });
  }
  if (skipTranscription) {
    return NextResponse.json({ audioUrl, transcript: "", speakerNames });
  }
  try {
    const speakerAudioFiles = formData.getAll("speakerAudio").filter((item): item is File => item instanceof File && item.size > 0);
    const audioChunks = formData.getAll("audioChunk").filter((item): item is File => item instanceof File && item.size > 0);
    const speakerAudioNamesField = formData.get("speakerAudioNames");
    const speakerAudioNames = typeof speakerAudioNamesField === "string" ? parseSpeakerNames(speakerAudioNamesField) : [];
    const speakerTranscript = await transcribeSpeakerAudio(speakerAudioFiles, speakerAudioNames, languageMode);
    const chunkTranscript = speakerTranscript ? "" : await transcribeAudioChunks(audioChunks, speakerNames, languageMode);
    const transcript = speakerTranscript || chunkTranscript || (await transcribeAudio(file, speakerNames, languageMode));
    return NextResponse.json({ audioUrl, transcript, speakerNames });
  } catch (error) {
    const publicError = publicAiTranscriptionError(error);
    return NextResponse.json({
      audioUrl,
      transcript: "",
      speakerNames,
      transcriptionError: publicError.message
    });
  }
}

async function transcribeSpeakerAudio(files: File[], names: string[], languageMode: TranscriptionLanguageMode) {
  if (!files.length) return "";
  const parts = await Promise.all(
    files.map(async (file, index) => {
      const speakerName = names[index] || `Speaker ${index + 1}`;
      const text = await transcribeAudio(file, [speakerName], languageMode);
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
      .slice(0, 50);
  } catch {
    return [];
  }
}
