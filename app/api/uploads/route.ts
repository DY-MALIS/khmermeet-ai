import { NextResponse } from "next/server";
import { saveLocalAudio } from "@/lib/storage";
import { requireUser } from "@/lib/session";

export async function POST(request: Request) {
  await requireUser();
  const formData = await request.formData();
  const file = formData.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
  }
  const audioUrl = await saveLocalAudio(file);
  return NextResponse.json({ audioUrl });
}
