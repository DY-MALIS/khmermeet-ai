import { NextResponse } from "next/server";
import { saveLocalAudio, transcribeAudio } from "@/lib/storage";
import { requireUser } from "@/lib/session";

export const maxDuration = 60;

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
    const transcript = await transcribeAudio(file, speakerNames);
    return NextResponse.json({ audioUrl, transcript });
  } catch (error) {
    return NextResponse.json({
      audioUrl,
      transcript: "",
      transcriptionError: error instanceof Error ? error.message : "Could not transcribe audio."
    });
  }
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
