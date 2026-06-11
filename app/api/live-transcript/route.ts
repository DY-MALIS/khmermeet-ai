import { NextResponse } from "next/server";
import { normalizeTranscriptionLanguageMode, transcribeAudio } from "@/lib/storage";
import { requireUser } from "@/lib/session";

export const maxDuration = 60;

export async function POST(request: Request) {
  await requireUser();
  const formData = await request.formData();
  const file = formData.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio chunk." }, { status: 400 });
  }

  const speakersField = formData.get("speakers");
  const speakerNames = typeof speakersField === "string" ? parseSpeakerNames(speakersField) : [];
  const languageMode = normalizeTranscriptionLanguageMode(formData.get("languageMode"));

  try {
    const transcript = await transcribeAudio(file, speakerNames, languageMode, {
      mode: "live",
      timeoutMs: 45000
    });
    return NextResponse.json({ transcript });
  } catch (error) {
    const message = error instanceof Error ? sanitizeError(error.message) : "Could not transcribe live audio.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

function sanitizeError(message: string) {
  return message
    .replace(/key=AIza[0-9A-Za-z_-]+/g, "key=[hidden]")
    .replace(/AIza[0-9A-Za-z_-]+/g, "[hidden-api-key]")
    .slice(0, 500);
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
