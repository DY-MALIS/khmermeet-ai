import { NextResponse } from "next/server";
import { processStudioText, type StudioAction } from "@/lib/studio";
import { requireUser } from "@/lib/session";
import { rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const limited = await rateLimitResponse(user.id, "ai-generate");
    if (limited) return limited;
    const body = (await request.json()) as {
      action?: StudioAction;
      text?: string;
      sourceLanguage?: string;
      targetLanguage?: string;
      instruction?: string;
    };
    if (!body.action || !["clean", "translate", "summarize"].includes(body.action)) {
      return NextResponse.json({ error: "Invalid AI action." }, { status: 400 });
    }
    if (!body.text?.trim()) {
      return NextResponse.json({ error: "Transcript is empty." }, { status: 400 });
    }
    const result = await processStudioText({
      action: body.action,
      text: body.text,
      sourceLanguage: body.sourceLanguage,
      targetLanguage: body.targetLanguage,
      instruction: body.instruction
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI processing failed." },
      { status: 500 }
    );
  }
}

